import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { importarVendaMarketplace, ErroImportacao } from "./importar-venda";
import type { PedidoMLRaw } from "./mercado-livre";
import { cancelarVendaMarketplace, type ResultadoCancelamento } from "./cancelar-venda";
import { importarDesdeDaConta } from "./config-conta";
import { pagamentoPrincipalML } from "./forma-pagamento";

// Pedido pago do Mercado Livre → Venda no ERP
// ===========================================
// Mesmo motor do Vallente (./importar-venda.ts), com o mesmo externoId
// "ML-<order id>": se a loja também recebe o pedido pelo Vallente, a segunda
// chegada é reconhecida como duplicada e não baixa estoque de novo.
//
// Só pedido com status "paid" vira venda (orçamento/pendente não conta como
// venda). O produto é achado pelo SKU do item (seller_sku / seller_custom_field
// = Produto.sku) ou, na falta, pelo vínculo do anúncio (MarketplaceAnuncio).
// Sem produto: o pedido fica registrado com o motivo e um alerta, sem venda.

export type ResultadoPedidoML =
  | { status: "IMPORTADO"; vendaId: string }
  | { status: "DUPLICADO"; vendaId: string }
  | { status: "NAO_PAGO" }
  | { status: "ANTES_DA_DATA_DE_IMPORTACAO" }
  | { status: "CANCELADO"; cancelamento: ResultadoCancelamento }
  | { status: "SEM_PRODUTO"; faltando: string[] };

export interface ItemPedidoML {
  itemId: string;
  sku: string | null;
  titulo: string;
  quantidade: number;
  precoUnitario: number;
}

export function itensDoPedidoML(o: PedidoMLRaw): ItemPedidoML[] {
  return (o.order_items ?? []).map((it) => ({
    itemId: it.item.id,
    sku: (it.item.seller_sku ?? it.item.seller_custom_field ?? null) || null,
    titulo: it.item.title,
    quantidade: it.quantity,
    precoUnitario: it.unit_price,
  }));
}

/** Frete pago pelo comprador: soma de shipping_cost dos pagamentos aprovados. */
export function freteDoPedidoML(o: PedidoMLRaw): number {
  const c = (o.payments ?? [])
    .filter((p) => !p.status || p.status === "approved")
    .reduce((a, p) => a + Math.round((p.shipping_cost ?? 0) * 100), 0);
  return c / 100;
}

export async function importarPedidoML(contaId: string, o: PedidoMLRaw): Promise<ResultadoPedidoML> {
  const conta = await prisma.marketplaceConta.findUniqueOrThrow({
    where: { id: contaId },
    select: { id: true, empresaId: true, nomeReferencia: true, configuracoes: true, criadoEm: true },
  });
  const pedidoIdExterno = String(o.id);
  const fee = (o.order_items ?? []).reduce((a, it) => a + Math.round((it.sale_fee ?? 0) * (it.quantity ?? 1) * 100), 0) / 100;
  const registro = await prisma.marketplacePedido.upsert({
    where: { contaId_pedidoIdExterno: { contaId, pedidoIdExterno } },
    update: { status: o.status, payloadOriginal: o as unknown as Prisma.InputJsonValue },
    create: {
      contaId,
      pedidoIdExterno,
      status: o.status,
      valorTotal: o.total_amount,
      valorFrete: freteDoPedidoML(o),
      feeMarketplace: fee,
      dataPedido: new Date(o.date_created),
      payloadOriginal: o as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, vendaId: true, observacao: true },
  });

  // Cancelado depois de importado: estorna (ou pede revisão se já tem nota).
  if (o.status === "cancelled") {
    const cancelamento = await cancelarVendaMarketplace({
      empresaId: conta.empresaId,
      contaId,
      pedidoIdExterno,
      externoId: `ML-${pedidoIdExterno}`,
    });
    return { status: "CANCELADO", cancelamento };
  }
  if (o.status !== "paid") return { status: "NAO_PAGO" };

  // Pedido anterior à data configurada na conta: fica registrado, mas não vira
  // venda (a loja pode já ter digitado à mão).
  if (new Date(o.date_created) < importarDesdeDaConta(conta)) {
    return { status: "ANTES_DA_DATA_DE_IMPORTACAO" };
  }

  const itens = itensDoPedidoML(o);
  const skus = itens.map((i) => i.sku).filter((s): s is string => !!s);
  const [porSku, anuncios] = await Promise.all([
    prisma.produto.findMany({
      where: { empresaId: conta.empresaId, sku: { in: skus } },
      select: { id: true, sku: true },
    }),
    prisma.marketplaceAnuncio.findMany({
      where: { contaId, itemIdExterno: { in: itens.map((i) => i.itemId) } },
      select: { itemIdExterno: true, produtoId: true },
    }),
  ]);
  const skuParaId = new Map(porSku.map((p) => [p.sku, p.id]));
  const anuncioParaId = new Map(anuncios.map((a) => [a.itemIdExterno, a.produtoId]));

  const faltando: string[] = [];
  const resolvidos = itens.map((it) => {
    const produtoId = (it.sku && skuParaId.get(it.sku)) || anuncioParaId.get(it.itemId);
    if (!produtoId) faltando.push(it.sku ? `${it.itemId} (SKU ${it.sku})` : it.itemId);
    return { ...it, produtoId };
  });

  if (faltando.length > 0) {
    const motivo = `Sem produto no ERP para: ${faltando.join(", ")}`.slice(0, 500);
    if (registro.observacao !== motivo) {
      await prisma.marketplacePedido.update({ where: { id: registro.id }, data: { observacao: motivo } });
      await prisma.insightIA.create({
        data: {
          empresaId: conta.empresaId,
          tipo: "CADASTRO_DUPLICADO",
          severidade: "AVISO",
          titulo: `Pedido ML ${pedidoIdExterno} pago sem produto vinculado`,
          descricao: `${motivo}. A venda não foi lançada e o estoque não foi baixado.`,
          acaoSugerida: "Preencher o SKU do anúncio no ML igual ao SKU do ERP (ou vincular o anúncio) e reprocessar.",
          dadosReferencia: { contaId, pedidoIdExterno, faltando },
        },
      });
    }
    return { status: "SEM_PRODUTO", faltando };
  }

  const pagto = pagamentoPrincipalML(o.payments);
  try {
    const r = await importarVendaMarketplace({
      empresaId: conta.empresaId,
      externoId: `ML-${pedidoIdExterno}`,
      origem: "MARKETPLACE_ML",
      marketplaceConta: conta.nomeReferencia,
      rotuloDocumento: `ML ${pedidoIdExterno}`,
      rotuloPedido: `Pedido ML ${pedidoIdExterno}`,
      itens: resolvidos.map((it) => ({
        produtoId: it.produtoId!,
        quantidade: it.quantidade,
        precoUnitario: it.precoUnitario,
      })),
      valorFrete: freteDoPedidoML(o),
      pago: true,
      bandeiraPagamento: pagto.bandeira,
      formaPagamento: pagto.forma,
      parcelas: pagto.parcelas,
      observacoes: `Pedido ML ${pedidoIdExterno} (${conta.nomeReferencia})`,
      dadosAlerta: { mlOrderId: pedidoIdExterno },
    });
    await prisma.marketplacePedido.update({
      where: { id: registro.id },
      data: { vendaId: r.vendaId, statusInterno: "IMPORTADO", observacao: null },
    });
    return r.duplicado ? { status: "DUPLICADO", vendaId: r.vendaId } : { status: "IMPORTADO", vendaId: r.vendaId };
  } catch (e) {
    if (e instanceof ErroImportacao) {
      await prisma.marketplacePedido.update({ where: { id: registro.id }, data: { observacao: e.message } });
      return { status: "SEM_PRODUTO", faltando: [] };
    }
    throw e;
  }
}
