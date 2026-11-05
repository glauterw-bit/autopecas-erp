// Configuração da Focus NFe por empresa (loja)
// ===========================================
// Ambiente e série vêm de Empresa.configuracoes.fiscal.focus; o token é segredo
// e fica em variável de ambiente: FOCUS_NFE_TOKEN_<CNPJ só dígitos>, com
// FOCUS_NFE_TOKEN como reserva (instalação de uma loja só).
// Ambiente padrão: homologação. Produção só quando a empresa E o servidor dizem
// produção — nota em produção tem valor legal.

export interface ConfigFocusEmpresa {
  ambiente: "homologacao" | "producao";
  serieNfe: string;
  serieNfce: string;
  token: string;
}

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

export function configFocus(
  empresa: { cnpj: string; configuracoes?: unknown },
  env: Record<string, string | undefined> = process.env,
): ConfigFocusEmpresa {
  const focus = (configFiscalDaEmpresa(empresa.configuracoes).focus ?? {}) as Record<string, unknown>;
  const cnpj = empresa.cnpj.replace(/\D/g, "");
  const ambienteEmpresa = focus.ambiente === "producao" ? "producao" : "homologacao";
  const ambiente = ambienteEmpresa === "producao" && env.FOCUS_NFE_AMBIENTE === "producao" ? "producao" : "homologacao";
  return {
    ambiente,
    serieNfe: String(focus.serieNfe ?? "1"),
    serieNfce: String(focus.serieNfce ?? "1"),
    token: env[`FOCUS_NFE_TOKEN_${cnpj}`] ?? env.FOCUS_NFE_TOKEN ?? "",
  };
}

/**
 * Configuração para CONSULTAR uma nota já emitida: usa o ambiente gravado na
 * nota, não o atual da empresa (a empresa pode ter passado para produção com
 * notas de homologação ainda em voo, e vice-versa).
 * Token: o da empresa vale quando o ambiente da nota é o atual; para a outra
 * ponta, é preciso o token próprio do ambiente (FOCUS_NFE_TOKEN_HOMOLOGACAO_<CNPJ>
 * ou FOCUS_NFE_TOKEN_HOMOLOGACAO; FOCUS_NFE_TOKEN_PRODUCAO_<CNPJ> ou
 * FOCUS_NFE_TOKEN_PRODUCAO). Esses tokens específicos têm prioridade.
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
  const especifico = env[`FOCUS_NFE_TOKEN_${sufixo}_${cnpj}`] ?? env[`FOCUS_NFE_TOKEN_${sufixo}`];
  return {
    ...base,
    ambiente,
    token: especifico ?? (ambiente === base.ambiente ? base.token : ""),
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
