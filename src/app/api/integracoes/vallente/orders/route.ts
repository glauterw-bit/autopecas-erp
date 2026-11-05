import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { empresaPorApiKey, respostaErro, ApiError } from "@/lib/auth/guard";
import { ErroImportacao, importarVendaMarketplace } from "@/lib/marketplaces/importar-venda";

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

export async function POST(req: NextRequest) {
  try {
    const empresa = await empresaPorApiKey(req);
    const pedido = schema.parse(await req.json());
    const externoId = `ML-${pedido.mlOrderId}`;
    const pago = pedido.status === "paid";

    // Reenvio: resolve antes de exigir os SKUs (o pedido já virou venda).
    const existente = await prisma.venda.findFirst({
      where: { empresaId: empresa.id, externoId },
      select: { id: true },
    });

    let porSku = new Map<string, string>();
    if (!existente) {
      const skus = pedido.items.map((i) => i.sku);
      const produtos = await prisma.produto.findMany({
        where: { empresaId: empresa.id, sku: { in: skus } },
        select: { id: true, sku: true },
      });
      porSku = new Map(produtos.map((p) => [p.sku, p.id]));
      const faltando = skus.filter((s) => !porSku.has(s));
      if (faltando.length > 0) {
        throw new ApiError(422, `SKUs não encontrados no ERP: ${faltando.join(", ")}`);
      }
    }

    // Lógica compartilhada com o ML direto (src/lib/marketplaces/importar-venda.ts):
    // idempotente por (empresaId, externoId), baixa pelo kardex na mesma transação.
    const r = await importarVendaMarketplace({
      empresaId: empresa.id,
      externoId,
      origem: "MARKETPLACE_ML",
      marketplaceConta: "VALLENTE_HUB",
      rotuloDocumento: `ML ${pedido.mlOrderId} (Vallente)`,
      rotuloPedido: `Pedido ML ${pedido.mlOrderId} (Vallente)`,
      itens: pedido.items.map((it) => ({
        produtoId: porSku.get(it.sku) ?? "",
        quantidade: it.quantity,
        precoUnitario: it.unitPrice,
        total: it.totalPrice,
      })),
      valorTotal: pedido.totalAmount,
      valorFrete: pedido.shippingCost,
      pago,
      bandeiraPagamento: pedido.paymentMethod,
      observacoes: `Pedido ML ${pedido.mlOrderId} via Vallente Hub — ${pedido.customerName} ${pedido.customerDocument}`.trim(),
      dadosAlerta: { mlOrderId: pedido.mlOrderId },
    });

    if (r.duplicado) return NextResponse.json({ id: r.vendaId, duplicado: true });
    return NextResponse.json({ id: r.vendaId, numero: r.numero }, { status: 201 });
  } catch (e) {
    if (e instanceof ErroImportacao) return respostaErro(new ApiError(e.status, e.message));
    return respostaErro(e);
  }
}
