import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { empresaPorApiKey, respostaErro, ApiError } from "@/lib/auth/guard";

// Recebe vendas do Mercado Livre exportadas pelo Vallente Hub
// (erp.service.exportSalesToErp → GenericErpClient.createSaleOrder).
// Idempotente por mlOrderId: reenvio do mesmo pedido não duplica venda
// nem baixa estoque duas vezes.

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
      return NextResponse.json({ id: existente.id, duplicado: true });
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

    const venda = await prisma.$transaction(async (tx) => {
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
          status: pedido.status === "paid" ? "PAGA" : "ABERTA",
          valorBruto,
          valorFrete: pedido.shippingCost,
          valorTotal,
          custoTotal,
          margemBruta: valorTotal - custoTotal,
          margemPercent: valorTotal > 0 ? (valorTotal - custoTotal) / valorTotal : 0,
          observacoes: `Pedido ML ${pedido.mlOrderId} via Vallente Hub — ${pedido.customerName} ${pedido.customerDocument}`.trim(),
          itens: { create: itens },
          pagamentos: {
            create: [{ formaPagamento: "PIX", valor: valorTotal, parcelas: 1, bandeira: pedido.paymentMethod }],
          },
        },
      });

      for (const it of pedido.items) {
        const p = porSku.get(it.sku)!;
        const dep =
          p.estoques.find((e) => Number(e.quantidade) >= it.quantity) ?? p.estoques[0];
        if (!dep) continue;
        await tx.estoqueDeposito.update({
          where: { id: dep.id },
          data: { quantidade: { decrement: it.quantity } },
        });
        await tx.movimentoEstoque.create({
          data: {
            produtoId: p.id,
            depositoId: dep.depositoId,
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

    return NextResponse.json({ id: venda.id, numero: venda.numero }, { status: 201 });
  } catch (e) {
    return respostaErro(e);
  }
}
