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
// Lista ÚNICA de CFOPs de venda com ST: 5.401, 5.402, 5.403 e 5.405 (operação interna) e
// 6.401 a 6.404 (interestadual). Fonte: tabela de CFOP do Convênio s/nº de 1970 (Anexo,
// atualizado por Ajustes SINIEF): https://www.confaz.fazenda.gov.br/legislacao/ajustes/sinief/cfop_cvsn_70_vigente
// Hipótese a conferir com o contador: transferência com ST (5.408/5.409, 6.408/6.409).
// Usada pelo bloqueio da ST de SP, pelo emissor (CST padrão) e pela virada da ST.
export const CFOPS_ST = new Set(["5401", "5402", "5403", "5405", "6401", "6402", "6403", "6404"]);
export const CFOPS_ST_INTERESTADUAIS = new Set([...CFOPS_ST].filter((c) => c.startsWith("6")));

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

/**
 * Venda com cara de ST (CST 60, CSOSN 500 ou CFOP 5405/5403/...) sem CEST, por
 * emitente de SP depois de 01/10/2026: bloqueia.
 * Por quê: `ehAutopeca` só reconhece peça sem CEST pelo NCM 8708, e filtro
 * (8421), vela (8511), rolamento (8482) etc. passariam como "não autopeça"
 * mesmo estando no segmento 01 do Conv. ICMS 142/2018 (Anexo II). Sem CEST não
 * dá para saber se o item ainda tem ST; na dúvida o sistema não deixa passar.
 * O CEST identifica as mercadorias sujeitas a ST e deve constar no documento
 * fiscal quando o item está nos anexos do Conv. ICMS 142/2018:
 *   https://www.confaz.fazenda.gov.br/legislacao/convenios/2018/CV142_18
 * Fim da ST de autopeças em SP: Portaria SRE 34/2026 (ver topo do arquivo).
 */
export function erroStSemCestSp(opts: {
  ufEmitente: string;
  dataOperacao: Date;
  produto: { cest?: string | null; nome?: string; sku?: string };
  cstUsado: string;
  cfopUsado: string;
}): string | null {
  if (opts.ufEmitente !== "SP" || !naOuDepois(opts.dataOperacao, FIM_ST_AUTOPECAS_SP)) return null;
  if (soDigitos(opts.produto.cest).length === 7) return null;
  const temSt = CSTS_ST_SUBSTITUIDO.has(opts.cstUsado) || CFOPS_ST.has(opts.cfopUsado);
  if (!temSt) return null;
  const nome = opts.produto.sku ? `${opts.produto.sku} (${opts.produto.nome ?? ""})` : opts.produto.nome ?? "";
  return (
    `O produto ${nome} está como venda com substituição tributária (CST/CSOSN ${opts.cstUsado}, CFOP ${opts.cfopUsado}) ` +
    `mas não tem CEST. Desde 01/10/2026 a maioria das autopeças saiu da ST em SP (Portaria SRE 34/2026), e sem o CEST ` +
    `o sistema não consegue saber se esta peça ainda tem ST. Revise o cadastro fiscal do produto (CEST, CST/CSOSN e CFOP) ` +
    `com o contador antes de emitir.`
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
