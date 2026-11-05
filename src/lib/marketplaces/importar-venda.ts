import { Prisma, type OrigemVenda } from "@prisma/client";
import { prisma } from "../db";

// Importa um pedido de marketplace como Venda no ERP
// ==================================================
// Padrão nascido na rota do Vallente (/api/integracoes/vallente/orders) e
// reaproveitado pelo Mercado Livre direto:
// - Idempotente por (empresaId, externoId) — unique no banco. O externoId do
//   ML é sempre "ML-<order id>", venha pelo Vallente ou direto: se a loja usar
//   os dois caminhos, o mesmo pedido não vira duas vendas.
// - Baixa de estoque pelo kardex (MovimentoEstoque SAIDA, origem VENDA) na
//   mesma transação. Sem saldo, baixa assim mesmo (a venda já aconteceu),
//   deixa negativo e abre alerta.
// - Reenvio de pedido ABERTO que chega pago promove para PAGA e cria o
//   pagamento. Nunca duplica.
// - Valores em centavos inteiros na conta e gravados com 2 casas.

export interface ItemImportacao {
  produtoId: string;
  quantidade: number;
  precoUnitario: number; // reais
  total?: number; // reais; padrão preço × quantidade
}

export interface PedidoImportacao {
  empresaId: string;
  externoId: string; // ex.: "ML-2000001234"
  origem: OrigemVenda;
  marketplaceConta: string; // rótulo (ex.: "VALLENTE_HUB", nome da conta ML)
  rotuloDocumento: string; // vai em MovimentoEstoque.documento
  rotuloPedido: string; // usado no texto do alerta (ex.: "Pedido ML 123 (Vallente)")
  itens: ItemImportacao[];
  valorTotal?: number; // reais; padrão itens + frete
  valorFrete: number;
  pago: boolean;
  bandeiraPagamento?: string;
  observacoes: string;
  dadosAlerta?: Record<string, unknown>;
}

export type ResultadoImportacao =
  | { vendaId: string; numero: number; duplicado: false }
  | { vendaId: string; duplicado: true; promovidaParaPaga: boolean };

export class ErroImportacao extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const centavos = (reais: number) => Math.round(reais * 100);
const reais = (c: number) => c / 100;

/** Totais da venda em centavos (pura, testável). */
export function calcularTotais(
  itens: Array<ItemImportacao & { custoMedio: number }>,
  valorFrete: number,
  valorTotal?: number,
) {
  let bruto = 0;
  let custo = 0;
  const linhas = itens.map((it) => {
    const totalC = it.total != null && it.total > 0 ? centavos(it.total) : centavos(it.precoUnitario * it.quantidade);
    const custoC = centavos(it.custoMedio * it.quantidade);
    bruto += centavos(it.precoUnitario * it.quantidade);
    custo += custoC;
    return { ...it, totalC, custoC };
  });
  const totalC = valorTotal && valorTotal > 0 ? centavos(valorTotal) : bruto + centavos(valorFrete);
  return { linhas, brutoC: bruto, custoC: custo, totalC };
}

async function vendaExistente(vendaId: string, pedido: PedidoImportacao): Promise<ResultadoImportacao> {
  const venda = await prisma.venda.findUniqueOrThrow({
    where: { id: vendaId },
    include: { pagamentos: { select: { id: true } } },
  });
  let promovida = false;
  if (venda.status === "ABERTA" && pedido.pago) {
    await prisma.$transaction(async (tx) => {
      const upd = await tx.venda.updateMany({
        where: { id: venda.id, status: "ABERTA" },
        data: { status: "PAGA" },
      });
      if (upd.count > 0 && venda.pagamentos.length === 0) {
        await tx.pagamentoVenda.create({
          data: {
            vendaId: venda.id,
            formaPagamento: "PIX",
            valor: venda.valorTotal,
            parcelas: 1,
            bandeira: pedido.bandeiraPagamento,
          },
        });
      }
      promovida = upd.count > 0;
    });
  }
  return { vendaId: venda.id, duplicado: true, promovidaParaPaga: promovida };
}

export async function importarVendaMarketplace(pedido: PedidoImportacao): Promise<ResultadoImportacao> {
  const { empresaId, externoId } = pedido;
  const existente = await prisma.venda.findFirst({
    where: { empresaId, externoId },
    select: { id: true },
  });
  if (existente) return vendaExistente(existente.id, pedido);

  const ids = [...new Set(pedido.itens.map((i) => i.produtoId))];
  const produtos = await prisma.produto.findMany({
    where: { empresaId, id: { in: ids } },
    include: { estoques: true },
  });
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const faltando = ids.filter((id) => !porId.has(id));
  if (faltando.length > 0) throw new ErroImportacao(422, "Produto do pedido não pertence a esta empresa");

  const { linhas, brutoC, custoC, totalC } = calcularTotais(
    pedido.itens.map((it) => ({ ...it, custoMedio: Number(porId.get(it.produtoId)!.custoMedio) })),
    pedido.valorFrete,
    pedido.valorTotal,
  );
  const itensCreate = linhas.map((l) => ({
    produto: { connect: { id: l.produtoId } },
    quantidade: l.quantidade,
    precoUnitario: l.precoUnitario,
    custoUnitario: Number(porId.get(l.produtoId)!.custoMedio),
    desconto: 0,
    total: reais(l.totalC),
    margem: reais(l.totalC - l.custoC),
  }));

  // Até 3 tentativas: a corrida do `numero` gera P2002 em (empresaId, numero)
  // — basta reexecutar. P2002 em (empresaId, externoId) é reenvio concorrente.
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const venda = await prisma.$transaction(async (tx) => {
        const ultima = await tx.venda.findFirst({
          where: { empresaId },
          orderBy: { numero: "desc" },
          select: { numero: true },
        });
        const v = await tx.venda.create({
          data: {
            empresaId,
            numero: (ultima?.numero ?? 0) + 1,
            tipo: "VENDA",
            origem: pedido.origem,
            marketplaceConta: pedido.marketplaceConta,
            externoId,
            status: pedido.pago ? "PAGA" : "ABERTA",
            valorBruto: reais(brutoC),
            valorFrete: pedido.valorFrete,
            valorTotal: reais(totalC),
            custoTotal: reais(custoC),
            margemBruta: reais(totalC - custoC),
            margemPercent: totalC > 0 ? Math.round(((totalC - custoC) / totalC) * 10_000) / 10_000 : 0,
            observacoes: pedido.observacoes,
            itens: { create: itensCreate },
            ...(pedido.pago
              ? {
                  pagamentos: {
                    create: [
                      {
                        formaPagamento: "PIX" as const,
                        valor: reais(totalC),
                        parcelas: 1,
                        bandeira: pedido.bandeiraPagamento,
                      },
                    ],
                  },
                }
              : {}),
          },
        });

        // Saldo consumido dentro desta venda (dois itens do mesmo produto).
        const consumido = new Map<string, number>();
        for (const it of pedido.itens) {
          const p = porId.get(it.produtoId)!;
          const comSaldo = p.estoques.find(
            (e) => Number(e.quantidade) - (consumido.get(e.id) ?? 0) >= it.quantidade,
          );
          let depositoId: string;
          if (comSaldo) {
            await tx.estoqueDeposito.update({
              where: { id: comSaldo.id },
              data: { quantidade: { decrement: it.quantidade } },
            });
            consumido.set(comSaldo.id, (consumido.get(comSaldo.id) ?? 0) + it.quantidade);
            depositoId = comSaldo.depositoId;
          } else {
            const dep =
              (await tx.deposito.findFirst({
                where: { empresaId },
                orderBy: { id: "asc" },
                select: { id: true },
              })) ??
              (await tx.deposito.create({
                data: { empresaId, nome: "Depósito principal", tipo: "LOJA" },
                select: { id: true },
              }));
            depositoId = dep.id;
            await tx.estoqueDeposito.upsert({
              where: { produtoId_depositoId: { produtoId: p.id, depositoId } },
              create: { produtoId: p.id, depositoId, quantidade: -it.quantidade },
              update: { quantidade: { decrement: it.quantidade } },
            });
            await tx.insightIA.create({
              data: {
                empresaId,
                tipo: "RUPTURA_PREDITIVA",
                severidade: "AVISO",
                titulo: "Venda de marketplace sem estoque suficiente",
                descricao: `${pedido.rotuloPedido} baixou ${it.quantidade}x ${p.sku} sem saldo suficiente em nenhum depósito — estoque ficou negativo.`,
                acaoSugerida: "Conferir estoque físico e ajustar; repor o produto ou pausar o anúncio.",
                dadosReferencia: {
                  produtoId: p.id,
                  sku: p.sku,
                  externoId,
                  quantidade: it.quantidade,
                  ...(pedido.dadosAlerta ?? {}),
                } as Prisma.InputJsonValue,
              },
            });
          }
          await tx.movimentoEstoque.create({
            data: {
              produtoId: p.id,
              depositoId,
              tipo: "SAIDA",
              quantidade: it.quantidade,
              custoUnitario: Number(p.custoMedio),
              origemTipo: "VENDA",
              origemId: v.id,
              documento: pedido.rotuloDocumento,
            },
          });
        }
        return v;
      });
      return { vendaId: venda.id, numero: venda.numero, duplicado: false };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = JSON.stringify(e.meta?.target ?? "");
        if (target.includes("externoId")) {
          const criada = await prisma.venda.findFirst({
            where: { empresaId, externoId },
            select: { id: true },
          });
          if (criada) return vendaExistente(criada.id, pedido);
          throw e;
        }
        if (target.includes("numero") && tentativa < 3) continue;
      }
      throw e;
    }
  }
  throw new ErroImportacao(409, "Não foi possível gerar o número da venda — tente novamente");
}
