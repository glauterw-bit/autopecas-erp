// Datas e parâmetros fiscais com vigência
// ========================================
// Um lugar só para as datas de lei e as alíquotas que mudam com o tempo.
// Cada constante cita a fonte. Se a fonte mudar, mude aqui e no teste.
// As datas são o início do dia em Brasília (UTC-03:00).

/** Converte "AAAA-MM-DD" no instante 00:00 de Brasília. */
export function inicioDiaBrasilia(isoData: string): Date {
  return new Date(`${isoData}T00:00:00-03:00`);
}

/** Data (AAAA-MM-DD) da operação no fuso de Brasília. */
export function dataBrasilia(d: Date): string {
  const local = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

/**
 * Fim da ICMS-ST de autopeças em SP: saídas a partir de 01/10/2026 são tributadas
 * normalmente. A Portaria SRE 34/2026 revoga o Anexo XIV da Portaria CAT 68/2019.
 * O estoque de 30/09/2026 segue a Portaria CAT 28/2020 (crédito/ressarcimento).
 * Fonte: https://legislacao.fazenda.sp.gov.br/Paginas/Portaria-SRE-34-de-2026.aspx
 *        https://andap.org.br/portaria-sre-34-exclusao-das-autopecas-da-sistematica-da-st-em-sao-paulo/
 */
export const FIM_ST_AUTOPECAS_SP = "2026-10-01";
/** Último dia com ST: data do inventário para a CAT 28/2020. */
export const DATA_ESTOQUE_VIRADA_ST_SP = "2026-09-30";

/**
 * Destaque de IBS/CBS na NF-e/NFC-e obrigatório para o regime normal desde
 * 03/08/2026 e para o Simples Nacional a partir de 01/01/2027.
 * Fonte: Ato Conjunto RFB/CGIBS nº 4/2026
 * https://www.cgibs.gov.br/upload/arquivos/202607/31091735-20260730-16h30-ato-conjunto-rfb-cgibs-na-c2-ba-4-260731-090909.pdf
 */
export const IBS_CBS_OBRIGATORIO_REGIME_NORMAL = "2026-08-03";
export const IBS_CBS_OBRIGATORIO_SIMPLES = "2027-01-01";

/**
 * Devolução precisa referenciar o documento original por item (grupo
 * DFeReferenciado: chave + nItem) desde 03/11/2026 (Rej. 321).
 * Fonte: NT 2025.002-RTC v1.5x — https://www.nfe.fazenda.gov.br/portal/
 *        resumo: https://www.tax360.com.br/conteudo/nt-nfe-nfce-2025-002-rtc-v152
 */
export const DEVOLUCAO_REFERENCIADA_POR_ITEM = "2026-11-03";

/** Alíquotas de IBS/CBS por ano-calendário, em percentual. */
export interface AliquotasIbsCbs {
  cbs: number;
  ibsUf: number;
  ibsMun: number;
  fonte: string;
}

/**
 * 2026 é o ano de teste: CBS 0,9% e IBS 0,1% (estadual), sem recolhimento
 * para quem cumpre a obrigação acessória (Ato Conjunto RFB/CGIBS 1/2025).
 * Fontes: LC 214/2025 arts. 343 (IBS 0,1%) e 346 (CBS 0,9%) —
 * https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm
 * IBS municipal 0% em 2026: lido em fonte secundária (https://taxcel.com.br/cclass-cst-ibs-cbs/).
 * PENDENTE CONTADOR: confirmar a partilha UF/município de 2026.
 *
 * 2027 em diante: a alíquota de referência da CBS ainda não está fixada
 * (TCU calculou 11,3468% em 28/10/2026; o Senado fixa até 15/12/2026). Sem
 * entrada para o ano, a emissão bloqueia — nunca chuta alíquota.
 * A empresa pode sobrescrever em configuracoes.fiscal.ibsCbs.aliquotas.
 */
export const ALIQUOTAS_IBS_CBS_POR_ANO: Record<number, AliquotasIbsCbs> = {
  2026: {
    cbs: 0.9,
    ibsUf: 0.1,
    ibsMun: 0,
    fonte: "LC 214/2025 arts. 343 e 346 (ano de teste)",
  },
};

export function aliquotasIbsCbs(
  data: Date,
  sobrescrever?: Partial<Record<string, AliquotasIbsCbs>> | null,
): AliquotasIbsCbs | null {
  const ano = Number(dataBrasilia(data).slice(0, 4));
  return sobrescrever?.[String(ano)] ?? ALIQUOTAS_IBS_CBS_POR_ANO[ano] ?? null;
}

export function naOuDepois(data: Date, isoData: string): boolean {
  return dataBrasilia(data) >= isoData;
}
