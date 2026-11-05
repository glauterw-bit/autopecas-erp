import { multiplicarCentavos } from "./dinheiro";

// Estoque parado
// ==============
// Item com saldo > 0 e sem venda FATURADA há 90, 180 ou 365 dias.
// Nunca vendido: conta a partir da última entrada (ou do cadastro).
// Ação sugerida é sugestão — quem decide é a loja.

export type FaixaParado = 90 | 180 | 365;

const DIA_MS = 86_400_000;

export function faixaParado(dias: number): FaixaParado | null {
  if (dias >= 365) return 365;
  if (dias >= 180) return 180;
  if (dias >= 90) return 90;
  return null;
}

export const ACAO_POR_FAIXA: Record<FaixaParado, string> = {
  90: "Oferecer às oficinas da carteira ou fazer promoção",
  180: "Negociar devolução/troca com o distribuidor ou deixar em condicional com oficina parceira",
  365: "Liquidar ou avaliar baixa por perda (fale com a contabilidade)",
};

export interface ItemEstoque {
  produtoId: string;
  estoque: number; // saldo físico (quantidade, não reservado)
  custoMedio: { toString(): string } | number;
  ultimaVendaEm: Date | null; // só venda faturada
  referenciaSemVenda: Date; // última entrada ou cadastro
}

export interface ItemParado {
  produtoId: string;
  dias: number;
  faixa: FaixaParado;
  nuncaVendido: boolean;
  valorImobilizadoCentavos: number;
  acao: string;
}

export function classificarParado(item: ItemEstoque, hoje = new Date()): ItemParado | null {
  if (!(item.estoque > 0)) return null;
  const base = item.ultimaVendaEm ?? item.referenciaSemVenda;
  const dias = Math.floor((hoje.getTime() - base.getTime()) / DIA_MS);
  const faixa = faixaParado(dias);
  if (!faixa) return null;
  return {
    produtoId: item.produtoId,
    dias,
    faixa,
    nuncaVendido: !item.ultimaVendaEm,
    valorImobilizadoCentavos: multiplicarCentavos(item.estoque, item.custoMedio),
    acao: ACAO_POR_FAIXA[faixa],
  };
}

/** Lista "parados há pelo menos `minimo` dias", do mais caro parado para o mais barato. */
export function estoqueParado(itens: ItemEstoque[], minimo: FaixaParado = 90, hoje = new Date()) {
  const lista = itens
    .map((i) => classificarParado(i, hoje))
    .filter((x): x is ItemParado => !!x && x.faixa >= minimo)
    .sort((a, b) => b.valorImobilizadoCentavos - a.valorImobilizadoCentavos);
  const totais = { 90: 0, 180: 0, 365: 0 } as Record<FaixaParado, number>;
  const quantidades = { 90: 0, 180: 0, 365: 0 } as Record<FaixaParado, number>;
  for (const i of itens.map((x) => classificarParado(x, hoje)).filter((x): x is ItemParado => !!x)) {
    totais[i.faixa] += i.valorImobilizadoCentavos;
    quantidades[i.faixa]++;
  }
  return { lista, totaisCentavos: totais, quantidades };
}
