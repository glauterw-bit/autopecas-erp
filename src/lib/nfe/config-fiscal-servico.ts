import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { ApiError } from "../auth/guard";
import { registrarAuditoria } from "../auth/auditoria";
import { ErroCripto } from "../cripto";
import {
  aplicarConfigFiscal,
  errosDeValidacao,
  esquemaConfigFiscal,
  lerConfigFiscal,
  visaoConfigFiscal,
  type ConfigFiscalGravada,
} from "./config-fiscal";
import { ErroCertificado, lerCertificadoA1 } from "./certificado-a1";
import { aplicarRespostaFocus, enviarEmpresaFocus, tokenRevenda, type EmpresaParaFocus } from "./focus-empresas";
import { checklistFiscal } from "./prontidao-fiscal";
import { servidorPermiteProducao } from "./config-focus";

// Leitura e gravação da configuração fiscal da loja (rotas de Configurações > Fiscal).

type Tx = Prisma.TransactionClient;

const CAMPOS_EMPRESA = {
  id: true, razaoSocial: true, nomeFantasia: true, cnpj: true, inscEstadual: true, inscMunicipal: true,
  regimeTributario: true, cnaeFiscal: true, logradouro: true, numero: true, complemento: true, bairro: true,
  municipio: true, uf: true, cep: true, telefone: true, configuracoes: true,
} as const;

/** Tira os segredos do que vai para o LogAuditoria. */
export function fiscalParaLog(f: ConfigFiscalGravada) {
  const marca = (v: unknown) => (v ? "[cifrado]" : null);
  return {
    ...f,
    focus: f.focus ? { ...f.focus, tokenHomologacao: marca(f.focus.tokenHomologacao), tokenProducao: marca(f.focus.tokenProducao) } : undefined,
    nfce: f.nfce ? { ...f.nfce, cscHomologacao: marca(f.nfce.cscHomologacao), cscProducao: marca(f.nfce.cscProducao) } : undefined,
  };
}

/** Grava só a chave "fiscal" do JSON, sem pisar no resto (tecdoc, marketplaces...). */
async function gravarFiscal(tx: Tx, empresaId: string, fiscal: ConfigFiscalGravada) {
  await tx.$executeRaw`UPDATE "empresas"
    SET "configuracoes" = jsonb_set(COALESCE("configuracoes", '{}'::jsonb), '{fiscal}', ${JSON.stringify(fiscal)}::jsonb, true),
        "atualizadoEm" = NOW()
    WHERE "id" = ${empresaId}`;
}

async function empresaTravada(tx: Tx, empresaId: string) {
  await tx.$queryRaw`SELECT 1 FROM "empresas" WHERE "id" = ${empresaId} FOR UPDATE`;
  return tx.empresa.findUniqueOrThrow({ where: { id: empresaId }, select: CAMPOS_EMPRESA });
}

export async function telaConfigFiscal(empresaId: string) {
  const e = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId }, select: CAMPOS_EMPRESA });
  return {
    empresa: {
      razaoSocial: e.razaoSocial,
      cnpj: e.cnpj,
      regimeTributario: e.regimeTributario,
      inscEstadual: e.inscEstadual ?? "",
      inscMunicipal: e.inscMunicipal ?? "",
      cnaeFiscal: e.cnaeFiscal ?? "",
      logradouro: e.logradouro ?? "",
      numero: e.numero ?? "",
      complemento: e.complemento ?? "",
      bairro: e.bairro ?? "",
      municipio: e.municipio ?? "",
      uf: e.uf ?? "",
      cep: e.cep ?? "",
    },
    fiscal: visaoConfigFiscal(e.configuracoes),
    checklist: checklistFiscal(e),
    servidor: {
      permiteProducao: servidorPermiteProducao(),
      envioAutomaticoFocus: !!tokenRevenda(),
    },
  };
}

export async function salvarConfigFiscal(empresaId: string, usuarioId: string, corpo: unknown) {
  const p = esquemaConfigFiscal.safeParse(corpo);
  if (!p.success) return { ok: false as const, campos: errosDeValidacao(p.error) };
  try {
    await prisma.$transaction(async (tx) => {
      const e = await empresaTravada(tx, empresaId);
      const atual = lerConfigFiscal(e.configuracoes);
      const { fiscal, colunas } = aplicarConfigFiscal(atual, p.data);
      await tx.empresa.update({ where: { id: empresaId }, data: colunas });
      await gravarFiscal(tx, empresaId, fiscal);
      await registrarAuditoria(tx, {
        empresaId,
        usuarioId,
        acao: "CONFIG_FISCAL_ALTERADA",
        entidade: "Empresa",
        entidadeId: empresaId,
        antes: { colunas: Object.fromEntries(Object.keys(colunas).map((k) => [k, (e as Record<string, unknown>)[k]])), fiscal: fiscalParaLog(atual) },
        depois: { colunas, fiscal: fiscalParaLog(fiscal) },
      });
    });
  } catch (e) {
    if (e instanceof ErroCripto) throw new ApiError(500, e.message);
    throw e;
  }
  const focus = p.data.modo === "api" && tokenRevenda() ? await sincronizarFocus(empresaId, usuarioId) : null;
  return { ok: true as const, focus };
}

/** Envia os dados da empresa (sem certificado) para a Focus no modo API. */
export async function sincronizarFocus(empresaId: string, usuarioId: string, simular = false) {
  const e = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId }, select: CAMPOS_EMPRESA });
  const r = await enviarEmpresaFocus(e as EmpresaParaFocus, { simular });
  if (!r.ok || simular) return r.ok ? { ok: true, mensagem: "Simulação aceita pela Focus (nada foi gravado lá)." } : r;
  await prisma.$transaction(async (tx) => {
    const atualE = await empresaTravada(tx, empresaId);
    const antes = lerConfigFiscal(atualE.configuracoes);
    const depois = aplicarRespostaFocus(antes, r.resposta, new Date());
    await gravarFiscal(tx, empresaId, depois);
    await registrarAuditoria(tx, {
      empresaId, usuarioId, acao: "CONFIG_FISCAL_ENVIADA_FOCUS", entidade: "Empresa", entidadeId: empresaId,
      antes: fiscalParaLog(antes), depois: fiscalParaLog(depois),
    });
  });
  return { ok: true, mensagem: "Dados enviados para a Focus." };
}

const MAX_PFX = 50 * 1024;

/**
 * Recebe o .pfx: lê validade e CNPJ, confere com a empresa e, no modo API,
 * envia à Focus. O arquivo e a senha não são gravados em lugar nenhum.
 */
export async function receberCertificado(
  empresaId: string,
  usuarioId: string,
  dados: { arquivo: Buffer; senha: string; enviarParaFocus: boolean },
  agora = new Date(),
) {
  if (!dados.arquivo.length) throw new ApiError(400, "Escolha o arquivo do certificado (.pfx ou .p12).");
  if (dados.arquivo.length > MAX_PFX) throw new ApiError(400, "Arquivo grande demais para um certificado A1 (máximo 50 KB).");
  if (!dados.senha) throw new ApiError(400, "Informe a senha do certificado.");

  let cert;
  try {
    cert = lerCertificadoA1(dados.arquivo, dados.senha);
  } catch (e) {
    if (e instanceof ErroCertificado) throw new ApiError(422, e.message);
    throw new ApiError(422, "Não foi possível ler o certificado. Confira o arquivo e a senha.");
  }
  const e = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId }, select: CAMPOS_EMPRESA });
  const cnpjEmpresa = e.cnpj.replace(/\D/g, "");
  // A SEFAZ aceita certificado com a mesma raiz de CNPJ (8 primeiros dígitos)
  // do emitente; outra raiz é rejeitada (MOC NF-e, rejeição 213).
  if (!cert.cnpj) {
    throw new ApiError(422, "Não foi possível ler o CNPJ do certificado. Confira se é um certificado A1 de empresa (e-CNPJ) e envie de novo.");
  }
  if (cert.cnpj.slice(0, 8) !== cnpjEmpresa.slice(0, 8)) {
    throw new ApiError(422, `Este certificado é de outro CNPJ (${cert.cnpj.slice(0, 2)}.${cert.cnpj.slice(2, 5)}.***), não da loja. Envie o certificado da própria empresa.`);
  }
  if (cert.validoAte.getTime() <= agora.getTime()) {
    throw new ApiError(422, `Este certificado venceu em ${cert.validoAte.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Renove com a certificadora.`);
  }

  let enviadoFocusEm: string | null = null;
  let respostaFocus = null;
  if (dados.enviarParaFocus) {
    const r = await enviarEmpresaFocus(e as EmpresaParaFocus, {
      certificado: { base64: dados.arquivo.toString("base64"), senha: dados.senha },
    });
    if (!r.ok) throw new ApiError(422, r.mensagem);
    respostaFocus = r.resposta;
    enviadoFocusEm = agora.toISOString();
  }

  await prisma.$transaction(async (tx) => {
    const atualE = await empresaTravada(tx, empresaId);
    const antes = lerConfigFiscal(atualE.configuracoes);
    let depois: ConfigFiscalGravada = respostaFocus ? aplicarRespostaFocus(antes, respostaFocus, agora) : { ...antes };
    depois = {
      ...depois,
      certificado: {
        validoAte: cert.validoAte.toISOString(),
        validoDe: cert.validoDe.toISOString(),
        titular: cert.titular,
        cnpj: cert.cnpj,
        emissor: cert.emissor,
        origem: "arquivo",
        atualizadoEm: agora.toISOString(),
        enviadoFocusEm,
      },
    };
    await gravarFiscal(tx, empresaId, depois);
    await registrarAuditoria(tx, {
      empresaId, usuarioId, acao: "CERTIFICADO_A1_RECEBIDO", entidade: "Empresa", entidadeId: empresaId,
      antes: { certificado: antes.certificado ?? null },
      depois: { certificado: depois.certificado, enviadoParaFocus: !!enviadoFocusEm },
    });
  });

  return {
    validoAte: cert.validoAte.toISOString(),
    titular: cert.titular,
    enviadoParaFocus: !!enviadoFocusEm,
    mensagem: enviadoFocusEm
      ? "Certificado lido e enviado para a Focus."
      : "Certificado lido. Agora envie o mesmo arquivo no painel da Focus NFe (o sistema não guarda o arquivo nem a senha).",
  };
}

/** Grava o que o teste trouxe da Focus (validade do certificado lá). */
export async function gravarRetornoTeste(empresaId: string, usuarioId: string, r: Parameters<typeof aplicarRespostaFocus>[1]) {
  await prisma.$transaction(async (tx) => {
    const atualE = await empresaTravada(tx, empresaId);
    const antes = lerConfigFiscal(atualE.configuracoes);
    const depois = aplicarRespostaFocus(antes, r, new Date(), process.env, { envio: false });
    await gravarFiscal(tx, empresaId, depois);
    await registrarAuditoria(tx, {
      empresaId, usuarioId, acao: "CONFIG_FISCAL_LIDA_FOCUS", entidade: "Empresa", entidadeId: empresaId,
      antes: { certificado: antes.certificado ?? null }, depois: { certificado: depois.certificado ?? null },
    });
  });
}
