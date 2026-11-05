import { z } from "zod";
import { cifrar, decifrarOpcional, ErroCripto, estaCifrado, mascarar } from "../cripto";
import { CST_IBS_CBS_SUPORTADOS } from "../fiscal/ibs-cbs";
import { ehSimples, type RegimeEmitente } from "../fiscal/st-sp";
import { CSOSN_ACEITOS, CST_ACEITOS, erroCstPadrao } from "./payload";
import { configFiscalDaEmpresa } from "./config-focus";

// Configuração fiscal da loja (Configurações > Fiscal)
// ====================================================
// Fica em Empresa.configuracoes.fiscal (JSON) mais as colunas da Empresa
// (regime, IE, IM, CNAE, endereço). Segredos (tokens da Focus e CSC da NFC-e)
// são gravados cifrados com src/lib/cripto.ts e só saem daqui mascarados.
// O .pfx e a senha do certificado NÃO são guardados: guardamos só a validade,
// o titular e o CNPJ lidos do arquivo (certificado-a1.ts).

export type Ambiente = "homologacao" | "producao";

export interface CertificadoGravado {
  validoAte: string; // ISO
  validoDe?: string | null;
  titular?: string | null;
  cnpj?: string | null;
  emissor?: string | null;
  /** arquivo = lido do .pfx; focus = informado pela API da Focus; informado = digitado pela loja. */
  origem: "arquivo" | "focus" | "informado";
  atualizadoEm: string;
  enviadoFocusEm?: string | null;
}

export interface FocusGravado {
  ambiente?: Ambiente;
  /** api = o sistema cadastra a empresa e o certificado na Focus; token = a loja já fez isso no painel da Focus. */
  modo?: "api" | "token";
  serieNfe?: string;
  serieNfce?: string;
  proximoNumeroNfe?: number | null;
  proximoNumeroNfce?: number | null;
  tokenHomologacao?: string; // cifrado
  tokenProducao?: string; // cifrado
  empresaIdFocus?: string | null;
  ultimoEnvioFocus?: string | null;
}

export interface NfceGravado {
  cscHomologacao?: string; // cifrado
  idTokenHomologacao?: string;
  cscProducao?: string; // cifrado
  idTokenProducao?: string;
}

export interface ConfigFiscalGravada {
  focus?: FocusGravado;
  nfce?: NfceGravado;
  certificado?: CertificadoGravado;
  cstIcmsPadrao?: string;
  cstPisCofinsSimples?: string;
  ibsCbs?: { cst?: string; cClassTrib?: string; [k: string]: unknown };
  emailXml?: string;
  [k: string]: unknown;
}

export function lerConfigFiscal(configuracoes: unknown): ConfigFiscalGravada {
  return configFiscalDaEmpresa(configuracoes) as ConfigFiscalGravada;
}

// ------------------------------------------------------------------ validação
const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB",
  "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

const digitos = (s: string) => s.replace(/\D/g, "");
const texto = (max: number, rotulo: string) =>
  z.string().trim().max(max, `${rotulo}: no máximo ${max} caracteres`);
/** undefined = não mexe; null ou "" = apaga; texto = grava cifrado. */
const segredo = (rotulo: string) =>
  z.union([z.string().trim().max(500, `${rotulo}: valor grande demais`), z.null()]).optional();

export const esquemaConfigFiscal = z
  .object({
    regimeTributario: z.enum(["SIMPLES_NACIONAL", "SIMPLES_EXCESSO_SUBLIMITE", "LUCRO_PRESUMIDO", "LUCRO_REAL", "MEI"], {
      errorMap: () => ({ message: "Regime tributário: escolha uma das opções" }),
    }),
    inscEstadual: z
      .string()
      .trim()
      .transform(digitos)
      .refine((v) => v.length >= 2 && v.length <= 14, "Inscrição estadual: informe só os números (2 a 14 dígitos)"),
    inscMunicipal: texto(20, "Inscrição municipal").transform(digitos).optional(),
    cnaeFiscal: z
      .string()
      .trim()
      .transform(digitos)
      .refine((v) => v === "" || v.length === 7, "CNAE: são 7 dígitos (ex.: 4530703)")
      .optional(),
    logradouro: texto(120, "Endereço").min(2, "Endereço: informe a rua"),
    numero: texto(20, "Número").min(1, "Número: informe o número (ou S/N)"),
    complemento: texto(60, "Complemento").optional(),
    bairro: texto(60, "Bairro").min(2, "Bairro: informe o bairro"),
    municipio: texto(60, "Município").min(2, "Município: informe a cidade"),
    uf: z.enum(UFS, { errorMap: () => ({ message: "UF: escolha o estado" }) }),
    cep: z
      .string()
      .trim()
      .transform(digitos)
      .refine((v) => v.length === 8, "CEP: são 8 dígitos"),

    ambiente: z.enum(["homologacao", "producao"], {
      errorMap: () => ({ message: "Ambiente: escolha homologação (teste) ou produção" }),
    }),
    modo: z.enum(["api", "token"], { errorMap: () => ({ message: "Escolha como o certificado chega à Focus" }) }),
    serieNfe: z.string().trim().regex(/^\d{1,3}$/, "Série da NF-e: número de 0 a 999"),
    serieNfce: z.string().trim().regex(/^\d{1,3}$/, "Série da NFC-e: número de 0 a 999"),
    proximoNumeroNfe: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.coerce
      .number({ invalid_type_error: "Próximo número da NF-e: só números" })
      .int("Próximo número da NF-e: só números inteiros")
      .min(1, "Próximo número da NF-e: a partir de 1")
      .max(999_999_999, "Próximo número da NF-e: no máximo 999.999.999").nullable(),
    ),
    proximoNumeroNfce: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.coerce
      .number({ invalid_type_error: "Próximo número da NFC-e: só números" })
      .int("Próximo número da NFC-e: só números inteiros")
      .min(1, "Próximo número da NFC-e: a partir de 1")
      .max(999_999_999, "Próximo número da NFC-e: no máximo 999.999.999").nullable(),
    ),
    empresaIdFocus: z
      .string()
      .trim()
      .regex(/^\d*$/, "ID da empresa na Focus: só números")
      .optional(),

    tokenHomologacao: segredo("Token de homologação"),
    tokenProducao: segredo("Token de produção"),
    cscHomologacao: segredo("CSC de homologação"),
    cscProducao: segredo("CSC de produção"),
    idTokenHomologacao: z.string().trim().regex(/^\d{0,6}$/, "Id do token do CSC (homologação): até 6 dígitos").optional(),
    idTokenProducao: z.string().trim().regex(/^\d{0,6}$/, "Id do token do CSC (produção): até 6 dígitos").optional(),

    cstIcmsPadrao: z.string().trim().regex(/^(\d{2}|\d{3})?$/, "CST/CSOSN padrão: 2 dígitos (CST) ou 3 (CSOSN)").optional(),
    cstPisCofinsSimples: z.string().trim().regex(/^(\d{2})?$/, "CST de PIS/COFINS: 2 dígitos").optional(),
    cstIbsCbs: z.string().trim().regex(/^(\d{3})?$/, "CST de IBS/CBS: 3 dígitos").optional(),
    cClassTrib: z.string().trim().regex(/^(\d{6})?$/, "cClassTrib: 6 dígitos").optional(),
    emailXml: z
      .string()
      .trim()
      .max(200)
      .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "E-mail para o XML: endereço inválido")
      .optional(),
    /** Só no modo token, sem o .pfx: data de validade do certificado (AAAA-MM-DD). */
    certificadoValidoAte: z
      .string()
      .trim()
      .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Validade do certificado: use dia/mês/ano")
      .optional(),
  })
  .superRefine((v, ctx) => {
    const simples = ehSimples(v.regimeTributario as RegimeEmitente);
    if (v.cstIcmsPadrao) {
      if (simples && !CSOSN_ACEITOS.has(v.cstIcmsPadrao)) {
        ctx.addIssue({
          code: "custom",
          path: ["cstIcmsPadrao"],
          message: `Empresa do Simples usa CSOSN de 3 dígitos. Aceitos: ${[...CSOSN_ACEITOS].join(", ")}`,
        });
      }
      if (!simples && !CST_ACEITOS.has(v.cstIcmsPadrao)) {
        ctx.addIssue({
          code: "custom",
          path: ["cstIcmsPadrao"],
          message: `Regime normal usa CST de 2 dígitos. Aceitos: ${[...CST_ACEITOS].join(", ")}`,
        });
      }
    }
    if (v.certificadoValidoAte && v.modo !== "token") {
      ctx.addIssue({
        code: "custom",
        path: ["certificadoValidoAte"],
        message: "A validade digitada só vale quando a Focus já tem o certificado. Nos outros casos, envie o arquivo .pfx para o sistema ler a validade.",
      });
    }
    if (v.cstIcmsPadrao) {
      const restrito = erroCstPadrao(simples, v.cstIcmsPadrao);
      if (restrito) ctx.addIssue({ code: "custom", path: ["cstIcmsPadrao"], message: restrito });
    }
    if (v.cstIbsCbs && !CST_IBS_CBS_SUPORTADOS.has(v.cstIbsCbs)) {
      ctx.addIssue({
        code: "custom",
        path: ["cstIbsCbs"],
        message: `CST de IBS/CBS ainda não calculado pelo sistema. Aceitos: ${[...CST_IBS_CBS_SUPORTADOS].join(", ")}`,
      });
    }
    if (!!v.cstIbsCbs !== !!v.cClassTrib) {
      ctx.addIssue({
        code: "custom",
        path: [v.cstIbsCbs ? "cClassTrib" : "cstIbsCbs"],
        message: "Informe o CST e o cClassTrib de IBS/CBS juntos (os dois vêm do contador)",
      });
    }
    if (v.cstPisCofinsSimples && !simples) {
      ctx.addIssue({
        code: "custom",
        path: ["cstPisCofinsSimples"],
        message: "O CST padrão de PIS/COFINS vale só para o Simples. No regime normal ele vem do produto.",
      });
    }
  });

export type EntradaConfigFiscal = z.infer<typeof esquemaConfigFiscal>;

const ROTULOS: Record<string, string> = {
  regimeTributario: "Regime tributário", inscEstadual: "Inscrição estadual", inscMunicipal: "Inscrição municipal",
  cnaeFiscal: "CNAE", logradouro: "Endereço", numero: "Número", complemento: "Complemento", bairro: "Bairro",
  municipio: "Município", uf: "UF", cep: "CEP", ambiente: "Ambiente", modo: "Envio do certificado",
  serieNfe: "Série da NF-e", serieNfce: "Série da NFC-e", proximoNumeroNfe: "Próximo número da NF-e",
  proximoNumeroNfce: "Próximo número da NFC-e", empresaIdFocus: "ID da empresa na Focus",
  idTokenHomologacao: "Id do token (homologação)", idTokenProducao: "Id do token (produção)",
  cstIcmsPadrao: "CST/CSOSN padrão", cstPisCofinsSimples: "CST de PIS/COFINS", cstIbsCbs: "CST de IBS/CBS",
  cClassTrib: "cClassTrib", emailXml: "E-mail para o XML", certificadoValidoAte: "Validade do certificado",
};

/** Primeira mensagem de cada campo, em português, para a tela. */
export function errosDeValidacao(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of e.issues) {
    const k = String(i.path[0] ?? "geral");
    // Mensagens padrão do zod (em inglês) viram "preencha" / "valor inválido".
    const generica = i.code === "invalid_type";
    const msg = generica
      ? `${ROTULOS[k] ?? k}: ${i.received === "undefined" || i.received === "null" ? "preencha este campo" : "valor inválido"}`
      : i.message;
    if (!out[k]) out[k] = msg;
  }
  return out;
}

// ------------------------------------------------------------------ aplicar
function segredoNovo(atual: string | undefined, novo: string | null | undefined, env: Env): string | undefined {
  if (novo === undefined) return atual;
  if (novo === null || novo === "") return undefined;
  if (estaCifrado(novo)) return atual; // nunca aceita valor cifrado vindo da tela
  return cifrar(novo, env);
}

type Env = Record<string, string | undefined>;

/**
 * Aplica o formulário sobre a configuração atual (puro, testado).
 * Devolve o novo `fiscal` (segredos cifrados) e as colunas da Empresa.
 */
export function aplicarConfigFiscal(
  atual: ConfigFiscalGravada,
  v: EntradaConfigFiscal,
  opts: { agora?: Date; env?: Env } = {},
) {
  const env = opts.env ?? process.env;
  const agora = opts.agora ?? new Date();
  const f = atual.focus ?? {};
  const n = atual.nfce ?? {};
  const fiscal: ConfigFiscalGravada = {
    ...atual,
    focus: {
      ...f,
      ambiente: v.ambiente,
      modo: v.modo,
      serieNfe: String(Number(v.serieNfe)),
      serieNfce: String(Number(v.serieNfce)),
      proximoNumeroNfe: v.proximoNumeroNfe ?? null,
      proximoNumeroNfce: v.proximoNumeroNfce ?? null,
      empresaIdFocus: v.empresaIdFocus === undefined ? f.empresaIdFocus ?? null : v.empresaIdFocus || null,
      tokenHomologacao: segredoNovo(f.tokenHomologacao, v.tokenHomologacao, env),
      tokenProducao: segredoNovo(f.tokenProducao, v.tokenProducao, env),
    },
    nfce: {
      ...n,
      cscHomologacao: segredoNovo(n.cscHomologacao, v.cscHomologacao, env),
      cscProducao: segredoNovo(n.cscProducao, v.cscProducao, env),
      idTokenHomologacao: v.idTokenHomologacao ?? n.idTokenHomologacao,
      idTokenProducao: v.idTokenProducao ?? n.idTokenProducao,
    },
    cstIcmsPadrao: v.cstIcmsPadrao || undefined,
    cstPisCofinsSimples: v.cstPisCofinsSimples || undefined,
    ibsCbs: { ...(atual.ibsCbs ?? {}), cst: v.cstIbsCbs || undefined, cClassTrib: v.cClassTrib || undefined },
    emailXml: v.emailXml || undefined,
  };
  // Validade digitada só vale quando não há leitura do arquivo ou da Focus.
  if (v.certificadoValidoAte && v.modo === "token" && (!atual.certificado || atual.certificado.origem === "informado")) {
    fiscal.certificado = {
      validoAte: new Date(`${v.certificadoValidoAte}T23:59:59-03:00`).toISOString(),
      origem: "informado",
      atualizadoEm: agora.toISOString(),
    };
  }
  const colunas = {
    regimeTributario: v.regimeTributario,
    inscEstadual: v.inscEstadual,
    inscMunicipal: v.inscMunicipal || null,
    cnaeFiscal: v.cnaeFiscal || null,
    logradouro: v.logradouro,
    numero: v.numero,
    complemento: v.complemento || null,
    bairro: v.bairro,
    municipio: v.municipio,
    uf: v.uf,
    cep: v.cep,
  };
  return { fiscal: JSON.parse(JSON.stringify(fiscal)) as ConfigFiscalGravada, colunas };
}

// ------------------------------------------------------------------ visão para a tela
export interface SegredoVisao {
  configurado: boolean;
  mascara: string;
  erro?: string;
}

function visaoSegredo(valor: string | undefined, env: Env): SegredoVisao {
  if (!valor) return { configurado: false, mascara: "" };
  try {
    return { configurado: true, mascara: mascarar(decifrarOpcional(valor, env)) };
  } catch (e) {
    return { configurado: true, mascara: "••••", erro: e instanceof ErroCripto ? e.message : "ilegível" };
  }
}

/** O que a tela recebe: nada de segredo em claro. */
export function visaoConfigFiscal(configuracoes: unknown, env: Env = process.env) {
  const c = lerConfigFiscal(configuracoes);
  const f = c.focus ?? {};
  const n = c.nfce ?? {};
  return {
    ambiente: (f.ambiente ?? "homologacao") as Ambiente,
    modo: f.modo ?? "token",
    serieNfe: f.serieNfe ?? "",
    serieNfce: f.serieNfce ?? "",
    proximoNumeroNfe: f.proximoNumeroNfe ?? null,
    proximoNumeroNfce: f.proximoNumeroNfce ?? null,
    empresaIdFocus: f.empresaIdFocus ?? "",
    ultimoEnvioFocus: f.ultimoEnvioFocus ?? null,
    tokenHomologacao: visaoSegredo(f.tokenHomologacao, env),
    tokenProducao: visaoSegredo(f.tokenProducao, env),
    cscHomologacao: visaoSegredo(n.cscHomologacao, env),
    cscProducao: visaoSegredo(n.cscProducao, env),
    idTokenHomologacao: n.idTokenHomologacao ?? "",
    idTokenProducao: n.idTokenProducao ?? "",
    cstIcmsPadrao: c.cstIcmsPadrao ?? "",
    cstPisCofinsSimples: c.cstPisCofinsSimples ?? "",
    cstIbsCbs: c.ibsCbs?.cst ?? "",
    cClassTrib: c.ibsCbs?.cClassTrib ?? "",
    emailXml: c.emailXml ?? "",
    certificado: c.certificado ?? null,
  };
}
export type VisaoConfigFiscal = ReturnType<typeof visaoConfigFiscal>;

/** CSC e id do token do ambiente, decifrados (só para enviar à Focus). */
export function cscDoAmbiente(c: ConfigFiscalGravada, ambiente: Ambiente, env: Env = process.env) {
  const n = c.nfce ?? {};
  return ambiente === "producao"
    ? { csc: decifrarOpcional(n.cscProducao, env), idToken: n.idTokenProducao || null }
    : { csc: decifrarOpcional(n.cscHomologacao, env), idToken: n.idTokenHomologacao || null };
}
