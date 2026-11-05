// Fim da ICMS-ST de autopeças em SP (01/10/2026)
// =============================================
// Portaria SRE 34/2026 revogou o Anexo XIV da Portaria CAT 68/2019 (autopeças).
// A partir de 01/10/2026 a venda interna de autopeça em SP não é mais
// "ST já recolhida": sai com ICMS próprio (regime normal) ou CSOSN de
// tributação normal (Simples). O CEST continua obrigatório para os itens do
// Convênio ICMS 142/2018, Anexo II, segmento 01 (autopeças).
// Fontes:
//   https://legislacao.fazenda.sp.gov.br/Paginas/Portaria-SRE-34-de-2026.aspx
//   Conv. ICMS 142/2018: https://www.confaz.fazenda.gov.br/legislacao/convenios/2018/CV142_18
//   CEST continua (blog): https://clmcontroller.com.br/en/tributos/fim-do-icms-st-para-autopecas-em-sao-paulo-o-que-muda/

import { FIM_ST_AUTOPECAS_SP, naOuDepois } from "./vigencias";

/** CST/CSOSN e CFOPs que representam "venda com ST" (substituído). */
export const CSTS_ST_SUBSTITUIDO = new Set(["60", "500"]);
export const CFOPS_ST = new Set(["5405", "5403", "5401", "6403", "6404", "6401"]);

export interface ProdutoFiscalBasico {
  ncm?: string | null;
  cest?: string | null;
  cstIcms?: string | null;
  cfopVendaInterna?: string | null;
}

const soDigitos = (s?: string | null) => (s ?? "").replace(/\D/g, "");

/**
 * Autopeça para fins da Portaria SRE 34/2026:
 *  - CEST do segmento 01 (Conv. 142/2018, Anexo II — autopeças), ou
 *  - sem CEST, mas NCM da posição 8708 (partes e acessórios de veículos).
 * Pneus (CEST 16) e baterias têm regra própria: ficam para revisão manual.
 */
export function ehAutopeca(p: ProdutoFiscalBasico): boolean {
  const cest = soDigitos(p.cest);
  if (cest.length === 7) return cest.startsWith("01");
  return soDigitos(p.ncm).startsWith("8708");
}

/** O cadastro está montado como venda com ST? */
export function cadastroComSt(p: ProdutoFiscalBasico): boolean {
  return (
    CSTS_ST_SUBSTITUIDO.has((p.cstIcms ?? "").trim()) ||
    CFOPS_ST.has((p.cfopVendaInterna ?? "").trim())
  );
}

export function stVedadaAutopecaSp(opts: {
  ufEmitente: string;
  ufDestino: string;
  dataOperacao: Date;
  produto: ProdutoFiscalBasico;
}): boolean {
  return (
    opts.ufEmitente === "SP" &&
    opts.ufDestino === "SP" &&
    naOuDepois(opts.dataOperacao, FIM_ST_AUTOPECAS_SP) &&
    ehAutopeca(opts.produto)
  );
}

/**
 * Para a emissão: devolve a mensagem de bloqueio se a venda interna em SP
 * levaria CST 60/CSOSN 500/CFOP 5405 para uma autopeça depois de 01/10/2026.
 */
export function erroStAutopecaSp(opts: {
  ufEmitente: string;
  ufDestino: string;
  dataOperacao: Date;
  produto: ProdutoFiscalBasico & { nome?: string; sku?: string };
  cstUsado: string;
  cfopUsado: string;
}): string | null {
  if (!stVedadaAutopecaSp(opts)) return null;
  const temSt = CSTS_ST_SUBSTITUIDO.has(opts.cstUsado) || CFOPS_ST.has(opts.cfopUsado);
  if (!temSt) return null;
  const nome = opts.produto.sku ? `${opts.produto.sku} (${opts.produto.nome ?? ""})` : opts.produto.nome ?? "";
  return (
    `O produto ${nome} ainda está cadastrado como venda com substituição tributária ` +
    `(CST/CSOSN ${opts.cstUsado}, CFOP ${opts.cfopUsado}). Desde 01/10/2026 autopeças saíram da ST em SP ` +
    `(Portaria SRE 34/2026). Ajuste o cadastro em Fiscal > Virada da ST antes de emitir.`
  );
}

export type RegimeEmitente = "SIMPLES_NACIONAL" | "SIMPLES_EXCESSO_SUBLIMITE" | "LUCRO_PRESUMIDO" | "LUCRO_REAL" | "MEI";

export function ehSimples(regime: RegimeEmitente): boolean {
  return regime === "SIMPLES_NACIONAL" || regime === "SIMPLES_EXCESSO_SUBLIMITE" || regime === "MEI";
}

/**
 * Tributação sugerida depois da ST (venda interna SP):
 *  - Simples: CSOSN 102 (tributada pelo Simples sem permissão de crédito), CFOP 5102.
 *    CSOSN 101 exige % de crédito por nota — não é sugerido automaticamente.
 *  - Regime normal: CST 00 (tributada integralmente), CFOP 5102; a alíquota
 *    interna vem do cadastro ou da tabela por UF (SP 18%, RICMS/SP art. 52).
 * PENDENTE CONTADOR: alíquota por NCM (há reduções de base e alíquotas
 * específicas no RICMS/SP) e CSOSN 101 x 102 para cada cliente.
 */
export function sugerirTributacaoPosSt(regime: RegimeEmitente): { cstIcms: string; cfopVendaInterna: string } {
  return ehSimples(regime)
    ? { cstIcms: "102", cfopVendaInterna: "5102" }
    : { cstIcms: "00", cfopVendaInterna: "5102" };
}
