import { decifrar, ErroCripto } from "../cripto";

// Configuração da Focus NFe por empresa (loja)
// ===========================================
// Tudo vem de Empresa.configuracoes.fiscal.focus, preenchido pela loja em
// Configurações > Fiscal: ambiente, séries e o token de cada ambiente
// (tokenHomologacao / tokenProducao), gravados cifrados (src/lib/cripto.ts).
// Reserva para o dono do sistema, quando a loja não informou o token:
// FOCUS_NFE_TOKEN_<CNPJ só dígitos> e, por fim, FOCUS_NFE_TOKEN.
// Ambiente padrão: homologação. Produção só quando a empresa E o servidor dizem
// produção (FOCUS_NFE_AMBIENTE=producao, liga uma vez para o servidor todo) —
// nota em produção tem valor legal.

export interface ConfigFocusEmpresa {
  ambiente: "homologacao" | "producao";
  serieNfe: string;
  serieNfce: string;
  token: string;
  /** De onde veio o token: tela da empresa, variável de ambiente ou nenhum. */
  origemToken: "empresa" | "env" | "nenhuma";
  /** Token salvo que não pôde ser decifrado (chave do servidor trocada). */
  erroToken?: string;
}

type Ambiente = ConfigFocusEmpresa["ambiente"];

export const FOCUS_BASE: Record<ConfigFocusEmpresa["ambiente"], string> = {
  homologacao: "https://homologacao.focusnfe.com.br",
  producao: "https://api.focusnfe.com.br",
};

type Json = Record<string, unknown> | null | undefined;

export function configFiscalDaEmpresa(configuracoes: unknown): Record<string, unknown> {
  const c = (configuracoes ?? {}) as Json;
  const f = c && typeof c === "object" ? (c as Record<string, unknown>).fiscal : undefined;
  return f && typeof f === "object" ? (f as Record<string, unknown>) : {};
}

function focusDaEmpresa(configuracoes: unknown): Record<string, unknown> {
  const f = configFiscalDaEmpresa(configuracoes).focus;
  return f && typeof f === "object" ? (f as Record<string, unknown>) : {};
}

/** Token salvo pela loja para o ambiente (decifrado). Vazio se não houver. */
export function tokenDaEmpresa(
  configuracoes: unknown,
  ambiente: Ambiente,
  env: Record<string, string | undefined> = process.env,
): { token: string; erro?: string } {
  const bruto = focusDaEmpresa(configuracoes)[ambiente === "producao" ? "tokenProducao" : "tokenHomologacao"];
  if (typeof bruto !== "string" || !bruto.trim()) return { token: "" };
  try {
    return { token: decifrar(bruto, env).trim() };
  } catch (e) {
    return { token: "", erro: e instanceof ErroCripto ? e.message : "Token da Focus salvo está ilegível." };
  }
}

/** O ambiente que a empresa escolheu na tela (antes da trava do servidor). */
export function ambienteEscolhido(configuracoes: unknown): Ambiente {
  return focusDaEmpresa(configuracoes).ambiente === "producao" ? "producao" : "homologacao";
}

export function servidorPermiteProducao(env: Record<string, string | undefined> = process.env): boolean {
  return env.FOCUS_NFE_AMBIENTE === "producao";
}

export function configFocus(
  empresa: { cnpj: string; configuracoes?: unknown },
  env: Record<string, string | undefined> = process.env,
): ConfigFocusEmpresa {
  const focus = focusDaEmpresa(empresa.configuracoes);
  const cnpj = empresa.cnpj.replace(/\D/g, "");
  const ambiente: Ambiente =
    ambienteEscolhido(empresa.configuracoes) === "producao" && servidorPermiteProducao(env) ? "producao" : "homologacao";
  const daEmpresa = tokenDaEmpresa(empresa.configuracoes, ambiente, env);
  const doEnv = env[`FOCUS_NFE_TOKEN_${cnpj}`] || env.FOCUS_NFE_TOKEN || "";
  const token = daEmpresa.token || (daEmpresa.erro ? "" : doEnv);
  return {
    ambiente,
    serieNfe: String(focus.serieNfe ?? "1"),
    serieNfce: String(focus.serieNfce ?? "1"),
    token,
    origemToken: daEmpresa.token ? "empresa" : token ? "env" : "nenhuma",
    ...(daEmpresa.erro ? { erroToken: daEmpresa.erro } : {}),
  };
}

/**
 * Configuração para CONSULTAR uma nota já emitida: usa o ambiente gravado na
 * nota, não o atual da empresa (a empresa pode ter passado para produção com
 * notas de homologação ainda em voo, e vice-versa).
 * Token, em ordem: o que a loja salvou para o ambiente da nota; o específico do
 * ambiente no env (FOCUS_NFE_TOKEN_HOMOLOGACAO_<CNPJ> ou
 * FOCUS_NFE_TOKEN_HOMOLOGACAO; FOCUS_NFE_TOKEN_PRODUCAO_<CNPJ> ou
 * FOCUS_NFE_TOKEN_PRODUCAO); o token atual, se o ambiente da nota for o atual.
 */
export function configFocusDaNota(
  empresa: { cnpj: string; configuracoes?: unknown },
  ambienteNota: "HOMOLOGACAO" | "PRODUCAO",
  env: Record<string, string | undefined> = process.env,
): ConfigFocusEmpresa {
  const base = configFocus(empresa, env);
  const ambiente: ConfigFocusEmpresa["ambiente"] = ambienteNota === "PRODUCAO" ? "producao" : "homologacao";
  const sufixo = ambiente === "producao" ? "PRODUCAO" : "HOMOLOGACAO";
  const cnpj = empresa.cnpj.replace(/\D/g, "");
  const daEmpresa = tokenDaEmpresa(empresa.configuracoes, ambiente, env);
  if (daEmpresa.token) return { ...base, ambiente, token: daEmpresa.token, origemToken: "empresa", erroToken: undefined };
  const especifico = env[`FOCUS_NFE_TOKEN_${sufixo}_${cnpj}`] ?? env[`FOCUS_NFE_TOKEN_${sufixo}`];
  const token = especifico ?? (ambiente === base.ambiente ? base.token : "");
  return {
    ...base,
    ambiente,
    token,
    origemToken: especifico ? "env" : ambiente === base.ambiente ? base.origemToken : "nenhuma",
    erroToken: daEmpresa.erro,
  };
}

/** CNPJ do emitente embutido na chave de acesso (posições 7 a 20). */
export function cnpjDaChave(chave: string): string {
  return chave.replace(/\D/g, "").slice(6, 20);
}

export function chaveEhDaEmpresa(chave: string, cnpjEmpresa: string): boolean {
  const c = chave.replace(/\D/g, "");
  return c.length === 44 && cnpjDaChave(c) === cnpjEmpresa.replace(/\D/g, "");
}
