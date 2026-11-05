/** Campos do produto que mudam a nota fiscal: exigem perfil FINANCEIRO ou acima (criar e alterar). */
export const CAMPOS_FISCAIS_PRODUTO = [
  "ncm",
  "cest",
  "cstIcms",
  "cfopVendaInterna",
  "cfopVendaInterestadual",
  "origemFiscal",
  "monofasicoPisCofins",
  "cstPis",
  "cstCofins",
  "cstIbsCbs",
  "cClassTrib",
] as const;

export const PERFIL_FISCAL_PRODUTO = "FINANCEIRO";
