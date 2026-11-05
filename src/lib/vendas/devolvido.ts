import { Prisma, type PrismaClient } from "@prisma/client";

// Quanto de cada item vendido já voltou da mão do cliente
// ========================================================
// Uma conta só para a devolução de balcão (RetornoVenda, origem VENDA) e o RMA
// (SolicitacaoRMA ligado ao item). Os dois caminhos enxergam um ao outro, então
// a mesma peça não volta ao estoque duas vezes.
//  - RetornoVenda origem CONDICIONAL não conta: a volta de condicional já
//    reduziu a quantidade do item.
//  - RMA conta desde a abertura (a peça está a caminho ou já voltou); só o
//    RMA RECUSADO deixa de contar (a peça volta para o cliente).
// Isto é o retorno FÍSICO. A NF-e de devolução tem a conta dela
// (ItemVenda.quantidadeDevolvidaNota), porque a mesma peça devolvida
// fisicamente também precisa de nota.

type Db = PrismaClient | Prisma.TransactionClient;

export const STATUS_RMA_QUE_NAO_CONTA = ["RECUSADA"] as const;

/** Soma de quantidades em milésimos (Decimal(14,3)), sem erro de float. */
export function somaMilesimos(valores: Array<number | string | Prisma.Decimal | null | undefined>): number {
  let m = 0;
  for (const v of valores) m += Math.round(Number(v ?? 0) * 1000);
  return m / 1000;
}

export async function jaRetornadoPorItem(
  db: Db,
  empresaId: string,
  itemVendaIds: string[],
  opts: { excluirRmaId?: string } = {},
): Promise<Map<string, number>> {
  const mapa = new Map<string, number>(itemVendaIds.map((id) => [id, 0]));
  if (itemVendaIds.length === 0) return mapa;
  const [retornos, rmas] = await Promise.all([
    db.retornoVenda.groupBy({
      by: ["itemVendaId"],
      where: { empresaId, itemVendaId: { in: itemVendaIds }, origem: "VENDA" },
      _sum: { quantidade: true },
    }),
    db.solicitacaoRMA.groupBy({
      by: ["itemVendaId"],
      where: {
        empresaId,
        itemVendaId: { in: itemVendaIds },
        status: { notIn: [...STATUS_RMA_QUE_NAO_CONTA] },
        ...(opts.excluirRmaId ? { id: { not: opts.excluirRmaId } } : {}),
      },
      _sum: { quantidade: true },
    }),
  ]);
  for (const r of [...retornos, ...rmas]) {
    if (!r.itemVendaId) continue;
    mapa.set(r.itemVendaId, somaMilesimos([mapa.get(r.itemVendaId), r._sum.quantidade?.toString()]));
  }
  return mapa;
}

/**
 * Trava a linha do item vendido até o fim da transação (SELECT ... FOR UPDATE).
 * Duas devoluções simultâneas do mesmo item passam a rodar uma depois da outra,
 * e a segunda já enxerga o que a primeira gravou. Filtra pela empresa.
 * Devolve a quantidade vendida, ou null se o item não é da empresa.
 */
export async function travarItemVenda(
  tx: Prisma.TransactionClient,
  empresaId: string,
  itemVendaId: string,
): Promise<{ quantidade: number; vendaId: string; produtoId: string } | null> {
  const linhas = await tx.$queryRaw<Array<{ quantidade: Prisma.Decimal; vendaId: string; produtoId: string }>>`
    SELECT iv.quantidade, iv."vendaId", iv."produtoId"
      FROM itens_venda iv
      JOIN vendas v ON v.id = iv."vendaId"
     WHERE iv.id = ${itemVendaId} AND v."empresaId" = ${empresaId}
       FOR UPDATE OF iv`;
  if (linhas.length === 0) return null;
  return { quantidade: Number(linhas[0].quantidade), vendaId: linhas[0].vendaId, produtoId: linhas[0].produtoId };
}

/** Saldo que ainda pode voltar (vendido − já retornado), em milésimos exatos. */
export function saldoRetornavel(vendida: number, jaRetornado: number): number {
  return Math.max(0, Math.round((vendida - jaRetornado) * 1000) / 1000);
}
