import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { empresaPorApiKey, respostaErro, ApiError } from "@/lib/auth/guard";

// Recebe vendas do Mercado Livre exportadas pelo Vallente Hub
// (erp.service.exportSalesToErp → GenericErpClient.createSaleOrder).
// Idempotente por mlOrderId: reenvio do mesmo pedido não duplica venda
// nem baixa estoque duas vezes — garantido pelo unique (empresaId, externoId).

const schema = z.object({
  mlOrderId: z.string().min(1),
  customerName: z.string().default("Cliente Mercado Livre"),
  customerDocument: z.string().optional().default(""),
  items: z
    .array(
      z.object({
        sku: z.string().min(1),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative(),
        totalPrice: z.number().nonnegative(),
      }),
    )
    .min(1),
  totalAmount: z.number().nonnegative(),
  shippingCost: z.number().nonnegative().default(0),
  paymentMethod: z.string().optional().default("mercadopago"),
  status: z.string().optional().default("paid"),
  date: z.string().optional(),
});

type Pedido = z.infer<typeof schema>;

// Reenvio de pedido já importado: se a venda está ABERTA e o pedido chegou
// como "paid", promove para PAGA e garante o PagamentoVenda. Nunca duplica.
async function responderVendaExistente(vendaId: string, pedido: Pedido) {
  const venda = await prisma.venda.findUniqueOrThrow({
    where: { id: vendaId },
    include: { pagamentos: { select: { id: true } } },
  });
  if (venda.status === "ABERTA" && pedido.status === "paid") {
    await prisma.$transaction(async (tx) => {
      await tx.venda.update({
        where: { id: venda.id },
        data: { status: "PAGA" },
      });
      if (venda.pagamentos.length === 0) {
        await tx.pagamentoVenda.create({
          data: {
            vendaId: venda.id,
            formaPagamento: "PIX",
            valor: venda.valorTotal,
            parcelas: 1,
            bandeira: pedido.paymentMethod,
          },
        });
      }
    });
  }
  return NextResponse.json({ id: venda.id, duplicado: true });
}

export async function POST(req: NextRequest) {
  try {
    const empresa = await empresaPorApiKey(req);
    const pedido = schema.parse(await req.json());
    const externoId = `ML-${pedido.mlOrderId}`;

    const existente = await prisma.venda.findFirst({
      where: { empresaId: empresa.id, externoId },
      select: { id: true },
    });
    if (existente) {
      return responderVendaExistente(existente.id, pedido);
    }

    const skus = pedido.items.map((i) => i.sku);
    const produtos = await prisma.produto.findMany({
      where: { empresaId: empresa.id, sku: { in: skus } },
      include: { estoques: true },
    });
    const porSku = new Map(produtos.map((p) => [p.sku, p]));
    const faltando = skus.filter((s) => !porSku.has(s));
    if (faltando.length > 0) {
      throw new ApiError(422, `SKUs não encontrados no ERP: ${faltando.join(", ")}`);
    }

    let valorBruto = 0;
    let custoTotal = 0;
    const itens = pedido.items.map((it) => {
      const p = porSku.get(it.sku)!;
      valorBruto += it.unitPrice * it.quantity;
      custoTotal += Number(p.custoMedio) * it.quantity;
      return {
        produto: { connect: { id: p.id } },
        quantidade: it.quantity,
        precoUnitario: it.unitPrice,
        custoUnitario: Number(p.custoMedio),
        desconto: 0,
        total: it.totalPrice || it.unitPrice * it.quantity,
        margem: (it.totalPrice || it.unitPrice * it.quantity) - Number(p.custoMedio) * it.quantity,
      };
    });
    const valorTotal = pedido.totalAmount || valorBruto + pedido.shippingCost;
    const pago = pedido.status === "paid";

    // Até 3 tentativas: a corrida do `numero` (duas vendas lendo o mesmo máximo)
    // gera P2002 em (empresaId, numero) — basta reexecutar com número novo.
    // P2002 em (empresaId, externoId) é reenvio concorrente → idempotência.
    let venda: { id: string; numero: number } | null = null;
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        venda = await prisma.$transaction(async (tx) => {
          const ultima = await tx.venda.findFirst({
            where: { empresaId: empresa.id },
            orderBy: { numero: "desc" },
            select: { numero: true },
          });
          const v = await tx.venda.create({
            data: {
              empresaId: empresa.id,
              numero: (ultima?.numero ?? 0) + 1,
              tipo: "VENDA",
              origem: "MARKETPLACE_ML",
              marketplaceConta: "VALLENTE_HUB",
              externoId,
              status: pago ? "PAGA" : "ABERTA",
              valorBruto,
              valorFrete: pedido.shippingCost,
              valorTotal,
              custoTotal,
              margemBruta: valorTotal - custoTotal,
              margemPercent: valorTotal > 0 ? (valorTotal - custoTotal) / valorTotal : 0,
              observacoes: `Pedido ML ${pedido.mlOrderId} via Vallente Hub — ${pedido.customerName} ${pedido.customerDocument}`.trim(),
              itens: { create: itens },
              // Só há pagamento quando o pedido chegou pago; "pending" cria a
              // venda ABERTA e o pagamento é criado no reenvio com "paid".
              ...(pago
                ? {
                    pagamentos: {
                      create: [
                        {
                          formaPagamento: "PIX" as const,
                          valor: valorTotal,
                          parcelas: 1,
                          bandeira: pedido.paymentMethod,
                        },
                      ],
                    },
                  }
                : {}),
            },
          });

          for (const it of pedido.items) {
            const p = porSku.get(it.sku)!;
            const comSaldo = p.estoques.find((e) => Number(e.quantidade) >= it.quantity);
            let depositoId: string;
            if (comSaldo) {
              await tx.estoqueDeposito.update({
                where: { id: comSaldo.id },
                data: { quantidade: { decrement: it.quantity } },
              });
              depositoId = comSaldo.depositoId;
            } else {
              // A venda no ML já aconteceu — a baixa não pode ser pulada.
              // Sem saldo em nenhum depósito: baixa (permitindo negativo) no
              // primeiro depósito da empresa e registra alerta.
              const dep =
                (await tx.deposito.findFirst({
                  where: { empresaId: empresa.id },
                  orderBy: { id: "asc" },
                  select: { id: true },
                })) ??
                (await tx.deposito.create({
                  data: { empresaId: empresa.id, nome: "Depósito principal", tipo: "LOJA" },
                  select: { id: true },
                }));
              depositoId = dep.id;
              await tx.estoqueDeposito.upsert({
                where: { produtoId_depositoId: { produtoId: p.id, depositoId } },
                create: { produtoId: p.id, depositoId, quantidade: -it.quantity },
                update: { quantidade: { decrement: it.quantity } },
              });
              await tx.insightIA.create({
                data: {
                  empresaId: empresa.id,
                  tipo: "RUPTURA_PREDITIVA",
                  severidade: "AVISO",
                  titulo: "Venda ML sem estoque suficiente",
                  descricao: `Pedido ML ${pedido.mlOrderId} (Vallente) baixou ${it.quantity}x ${p.sku} sem saldo suficiente em nenhum depósito — estoque ficou negativo.`,
                  acaoSugerida: "Conferir estoque físico e ajustar; repor o produto ou pausar o anúncio no ML.",
                  dadosReferencia: { produtoId: p.id, sku: p.sku, mlOrderId: pedido.mlOrderId, quantidade: it.quantity },
                },
              });
            }
            await tx.movimentoEstoque.create({
              data: {
                produtoId: p.id,
                depositoId,
                tipo: "SAIDA",
                quantidade: it.quantity,
                custoUnitario: Number(p.custoMedio),
                origemTipo: "VENDA",
                origemId: v.id,
                documento: `ML ${pedido.mlOrderId} (Vallente)`,
              },
            });
          }
          return v;
        });
        break;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          const target = JSON.stringify(e.meta?.target ?? "");
          if (target.includes("externoId")) {
            // Reenvio concorrente: outra requisição criou a venda primeiro.
            const criada = await prisma.venda.findFirst({
              where: { empresaId: empresa.id, externoId },
              select: { id: true },
            });
            if (criada) return responderVendaExistente(criada.id, pedido);
            throw e;
          }
          if (target.includes("numero") && tentativa < 3) continue;
        }
        throw e;
      }
    }
    if (!venda) {
      throw new ApiError(409, "Não foi possível gerar o número da venda — tente novamente");
    }

    return NextResponse.json({ id: venda.id, numero: venda.numero }, { status: 201 });
  } catch (e) {
    return respostaErro(e);
  }
}
