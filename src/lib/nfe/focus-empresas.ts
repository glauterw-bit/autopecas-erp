import axios from "axios";
import { randomBytes } from "node:crypto";
import { cifrar } from "../cripto";
import { cscDoAmbiente, lerConfigFiscal, type ConfigFiscalGravada } from "./config-fiscal";
import { FOCUS_BASE, tokenDaEmpresa } from "./config-focus";

// Focus NFe — cadastro da empresa e teste da configuração
// =======================================================
// API de empresas (revenda): https://doc.focusnfe.com.br/reference/empresas
//   POST https://api.focusnfe.com.br/v2/empresas        (criar)
//        https://doc.focusnfe.com.br/reference/criar_empresa
//   PUT  https://api.focusnfe.com.br/v2/empresas/{id}   (atualizar)
//        https://doc.focusnfe.com.br/reference/atualizar_empresa
//   GET  https://api.focusnfe.com.br/v2/empresas/{id}   (consultar)
//        https://doc.focusnfe.com.br/reference/consultar_empresa_por_id
// Só existe em produção ("esta API opera exclusivamente no ambiente de
// produção") e autentica com o token da conta de revenda (HTTP Basic, token no
// usuário e senha em branco). Cadastrar empresa não emite nota.
// Certificado: arquivo_certificado_base64 ("Arquivo PFX/P12 em base64") e
// senha_certificado. A resposta traz token_producao, token_homologacao e
// certificado_valido_ate. 422 erro_validacao lista os campos com problema.
//
// Teste da configuração sem emitir: GET /v2/nfe/{ref inexistente} em
// homologação (https://doc.focusnfe.com.br/reference/consultar_nfe):
// 404 "nao_encontrado" = token aceito; 401 = token recusado.

const API_EMPRESAS = "https://api.focusnfe.com.br/v2/empresas";
type Env = Record<string, string | undefined>;

export function tokenRevenda(env: Env = process.env): string {
  return (env.FOCUS_NFE_TOKEN_REVENDA ?? "").trim();
}

const REGIME_FOCUS: Record<string, number> = {
  SIMPLES_NACIONAL: 1,
  SIMPLES_EXCESSO_SUBLIMITE: 2,
  LUCRO_PRESUMIDO: 3,
  LUCRO_REAL: 3,
  MEI: 4,
};

export interface EmpresaParaFocus {
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string;
  inscEstadual: string | null;
  inscMunicipal: string | null;
  regimeTributario: string;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  telefone: string | null;
  configuracoes: unknown;
}

/** Corpo do POST/PUT de empresas (puro). Campos vazios ficam de fora. */
export function payloadEmpresaFocus(
  e: EmpresaParaFocus,
  certificado?: { base64: string; senha: string } | null,
  env: Env = process.env,
): Record<string, unknown> {
  const c = lerConfigFiscal(e.configuracoes);
  const f = c.focus ?? {};
  const amb = f.ambiente === "producao" ? "producao" : "homologacao";
  const cscH = cscDoAmbiente(c, "homologacao", env);
  const cscP = cscDoAmbiente(c, "producao", env);
  const p: Record<string, unknown> = {
    nome: e.razaoSocial,
    nome_fantasia: e.nomeFantasia,
    cnpj: e.cnpj.replace(/\D/g, ""),
    inscricao_estadual: e.inscEstadual,
    inscricao_municipal: e.inscMunicipal,
    regime_tributario: REGIME_FOCUS[e.regimeTributario],
    logradouro: e.logradouro,
    numero: e.numero,
    complemento: e.complemento,
    bairro: e.bairro,
    municipio: e.municipio,
    uf: e.uf,
    cep: e.cep?.replace(/\D/g, ""),
    telefone: e.telefone,
    habilita_nfe: true,
    habilita_nfce: true,
    serie_nfe_producao: f.serieNfe,
    serie_nfe_homologacao: f.serieNfe,
    serie_nfce_producao: f.serieNfce,
    serie_nfce_homologacao: f.serieNfce,
    [`proximo_numero_nfe_${amb}`]: f.proximoNumeroNfe ? String(f.proximoNumeroNfe) : undefined,
    [`proximo_numero_nfce_${amb}`]: f.proximoNumeroNfce ? String(f.proximoNumeroNfce) : undefined,
    csc_nfce_producao: cscP.csc,
    id_token_nfce_producao: cscP.idToken,
    csc_nfce_homologacao: cscH.csc,
    id_token_nfce_homologacao: cscH.idToken,
  };
  if (certificado) {
    p.arquivo_certificado_base64 = certificado.base64;
    p.senha_certificado = certificado.senha;
  }
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== ""));
}

/** Erro da Focus em português, sem ecoar o corpo enviado (tem senha). */
export function mensagemErroFocus(http: number, data: unknown): string {
  const d = (data ?? {}) as { codigo?: string; mensagem?: string; erros?: Array<{ campo?: string; mensagem?: string }> };
  if (http === 401) return "A Focus recusou o token (HTTP 401). Confira se copiou o token certo.";
  if (http === 403) return "O token não tem permissão para esta operação na Focus (HTTP 403).";
  if (Array.isArray(d.erros) && d.erros.length) {
    const linhas = d.erros.slice(0, 5).map((x) => {
      const campo = x.campo === "arquivo_certificado_base64" || x.campo === "senha_certificado" ? "certificado" : x.campo;
      return `${campo ?? "geral"}: ${String(x.mensagem ?? "").slice(0, 200)}`;
    });
    return `A Focus recusou os dados: ${linhas.join("; ")}`;
  }
  return `A Focus respondeu HTTP ${http}${d.mensagem ? `: ${String(d.mensagem).slice(0, 200)}` : ""}.`;
}

export interface RespostaEmpresaFocus {
  id: string;
  tokenHomologacao: string | null;
  tokenProducao: string | null;
  certificadoValidoAte: string | null;
  certificadoValidoDe: string | null;
  certificadoCnpj: string | null;
}

/** Cria ou atualiza a empresa na Focus. `simular` usa dry_run=1 (nada é gravado lá). */
export async function enviarEmpresaFocus(
  e: EmpresaParaFocus,
  opts: { certificado?: { base64: string; senha: string } | null; simular?: boolean; env?: Env } = {},
): Promise<{ ok: true; resposta: RespostaEmpresaFocus } | { ok: false; mensagem: string }> {
  const env = opts.env ?? process.env;
  const token = tokenRevenda(env);
  if (!token) {
    return {
      ok: false,
      mensagem:
        "O envio automático para a Focus não está ligado neste servidor (falta o token de revenda). Envie o certificado pelo painel da Focus e informe aqui só o token.",
    };
  }
  const id = lerConfigFiscal(e.configuracoes).focus?.empresaIdFocus;
  const url = `${API_EMPRESAS}${id ? `/${encodeURIComponent(id)}` : ""}${opts.simular ? "?dry_run=1" : ""}`;
  try {
    const resp = await axios.request({
      method: id ? "PUT" : "POST",
      url,
      data: payloadEmpresaFocus(e, opts.certificado, env),
      auth: { username: token, password: "" },
      headers: { "Content-Type": "application/json" },
      timeout: 30_000,
      validateStatus: () => true,
    });
    if (resp.status >= 400) return { ok: false, mensagem: mensagemErroFocus(resp.status, resp.data) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (resp.data ?? {}) as Record<string, any>;
    return {
      ok: true,
      resposta: {
        id: d.id != null ? String(d.id) : id ?? "",
        tokenHomologacao: d.token_homologacao || null,
        tokenProducao: d.token_producao || null,
        certificadoValidoAte: d.certificado_valido_ate || null,
        certificadoValidoDe: d.certificado_valido_de || null,
        certificadoCnpj: d.certificado_cnpj || null,
      },
    };
  } catch {
    return { ok: false, mensagem: "Não foi possível falar com a Focus agora. Tente de novo em alguns minutos." };
  }
}

/** Grava no `fiscal` o que a Focus devolveu (tokens cifrados, id e validade). Puro. */
export function aplicarRespostaFocus(
  fiscal: ConfigFiscalGravada,
  r: RespostaEmpresaFocus,
  agora: Date,
  env: Env = process.env,
  opts: { envio?: boolean } = { envio: true },
): ConfigFiscalGravada {
  const f = { ...(fiscal.focus ?? {}) };
  if (r.id) f.empresaIdFocus = r.id;
  if (r.tokenHomologacao) f.tokenHomologacao = cifrar(r.tokenHomologacao, env);
  if (r.tokenProducao) f.tokenProducao = cifrar(r.tokenProducao, env);
  if (opts.envio) f.ultimoEnvioFocus = agora.toISOString();
  const out: ConfigFiscalGravada = { ...fiscal, focus: f };
  if (r.certificadoValidoAte && fiscal.certificado?.origem !== "arquivo") {
    out.certificado = {
      ...(fiscal.certificado ?? {}),
      validoAte: new Date(r.certificadoValidoAte).toISOString(),
      validoDe: r.certificadoValidoDe ? new Date(r.certificadoValidoDe).toISOString() : null,
      cnpj: r.certificadoCnpj,
      origem: "focus",
      atualizadoEm: agora.toISOString(),
    };
  }
  return out;
}

export interface ResultadoTeste {
  ok: boolean;
  etapas: Array<{ nome: string; ok: boolean; mensagem: string }>;
}

/**
 * Testa a configuração SEM emitir: confere o token de homologação na Focus e,
 * se houver API de revenda e o id da empresa, lê a validade do certificado lá.
 */
export async function testarConfiguracaoFocus(
  empresa: { cnpj: string; configuracoes: unknown },
  env: Env = process.env,
): Promise<ResultadoTeste & { empresaFocus?: RespostaEmpresaFocus }> {
  const etapas: ResultadoTeste["etapas"] = [];
  const cnpj = empresa.cnpj.replace(/\D/g, "");
  const daEmpresa = tokenDaEmpresa(empresa.configuracoes, "homologacao", env);
  const token =
    daEmpresa.token ||
    env[`FOCUS_NFE_TOKEN_HOMOLOGACAO_${cnpj}`] ||
    env.FOCUS_NFE_TOKEN_HOMOLOGACAO ||
    "";
  if (daEmpresa.erro) {
    etapas.push({ nome: "Token de homologação", ok: false, mensagem: daEmpresa.erro });
  } else if (!token) {
    etapas.push({
      nome: "Token de homologação",
      ok: false,
      mensagem:
        "Falta o token de homologação. Ele aparece no painel da Focus NFe, no cadastro da sua empresa. Copie e cole no campo \"Token de homologação\".",
    });
  } else {
    const ref = `teste-configuracao-${randomBytes(6).toString("hex")}`;
    try {
      const r = await axios.get(`${FOCUS_BASE.homologacao}/v2/nfe/${ref}`, {
        auth: { username: token, password: "" },
        timeout: 15_000,
        validateStatus: () => true,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const codigo = (r.data as any)?.codigo;
      if (r.status === 404) {
        etapas.push({
          nome: "Token de homologação",
          ok: true,
          mensagem: "A Focus aceitou o token de homologação (consulta feita sem emitir nota).",
        });
      } else if (r.status === 401) {
        etapas.push({ nome: "Token de homologação", ok: false, mensagem: "A Focus recusou o token de homologação. Confira se copiou o token certo, sem espaços." });
      } else if (r.status === 403) {
        etapas.push({
          nome: "Token de homologação",
          ok: false,
          mensagem: "Token aceito, mas sem permissão para NF-e. No painel da Focus, habilite NF-e e NFC-e para a empresa.",
        });
      } else {
        etapas.push({
          nome: "Token de homologação",
          ok: false,
          mensagem: `Resposta inesperada da Focus (HTTP ${r.status}${codigo ? `, ${codigo}` : ""}).`,
        });
      }
    } catch {
      etapas.push({ nome: "Token de homologação", ok: false, mensagem: "Não foi possível falar com a Focus agora (rede ou Focus fora do ar)." });
    }
  }

  let empresaFocus: RespostaEmpresaFocus | undefined;
  const id = lerConfigFiscal(empresa.configuracoes).focus?.empresaIdFocus;
  const revenda = tokenRevenda(env);
  if (revenda && id) {
    try {
      const r = await axios.get(`${API_EMPRESAS}/${encodeURIComponent(id)}`, {
        auth: { username: revenda, password: "" },
        timeout: 15_000,
        validateStatus: () => true,
      });
      if (r.status >= 400) {
        etapas.push({ nome: "Cadastro na Focus", ok: false, mensagem: mensagemErroFocus(r.status, r.data) });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = (r.data ?? {}) as Record<string, any>;
        empresaFocus = {
          id: String(d.id ?? id),
          tokenHomologacao: null,
          tokenProducao: null,
          certificadoValidoAte: d.certificado_valido_ate || null,
          certificadoValidoDe: d.certificado_valido_de || null,
          certificadoCnpj: d.certificado_cnpj || null,
        };
        const docOk = String(d.cnpj ?? "").replace(/\D/g, "") === cnpj;
        etapas.push({
          nome: "Cadastro na Focus",
          ok: docOk,
          mensagem: docOk
            ? `Empresa encontrada na Focus${d.certificado_valido_ate ? `; certificado válido até ${new Date(d.certificado_valido_ate).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "; sem certificado cadastrado"}.`
            : "O ID informado é de outra empresa na Focus. Confira o ID.",
        });
      }
    } catch {
      etapas.push({ nome: "Cadastro na Focus", ok: false, mensagem: "Não foi possível consultar o cadastro na Focus agora." });
    }
  }

  return { ok: etapas.length > 0 && etapas.every((e) => e.ok), etapas, empresaFocus };
}
