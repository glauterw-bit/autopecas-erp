import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  conta: { id: "c1", empresaId: "emp1", nomeReferencia: "ML", configuracoes: { importarPedidosDesde: "2026-11-03T00:00:00.000Z" }, criadoEm: new Date("2026-10-01") },
  cancelar: vi.fn(async () => ({ status: "CANCELADA", vendaId: "v1", itensDevolvidos: 1, contasCanceladas: 0 })),
  importar: vi.fn(async () => ({ vendaId: "v1", numero: 1, duplicado: false })),
}));
vi.mock("../db", () => ({
  prisma: {
    marketplaceConta: { findUniqueOrThrow: async () => h.conta },
    marketplacePedido: {
      upsert: async () => ({ id: "p1", vendaId: null, observacao: null }),
      update: async () => ({}),
    },
    produto: { findMany: async () => [{ id: "prod1", sku: "SKU1" }] },
    marketplaceAnuncio: { findMany: async () => [] },
  },
}));
vi.mock("./cancelar-venda", () => ({ cancelarVendaMarketplace: h.cancelar }));
vi.mock("./importar-venda", () => ({ importarVendaMarketplace: h.importar, ErroImportacao: class extends Error {} }));

import { importarPedidoML } from "./pedido-ml";
import type { PedidoMLRaw } from "./mercado-livre";

const pedido = (status: string, data: string): PedidoMLRaw => ({
  id: 2000001, status, total_amount: 100, date_created: data,
  payments: [{ status: "approved", payment_type: "credit_card", payment_method_id: "visa", installments: 2 }],
  order_items: [{ item: { id: "MLB1", title: "Pastilha", seller_sku: "SKU1" }, quantity: 1, unit_price: 100 }],
});

beforeEach(() => { h.cancelar.mockClear(); h.importar.mockClear(); });

describe("importarPedidoML", () => {
  it("pedido pago antes da data configurada fica registrado e não vira venda", async () => {
    const r = await importarPedidoML("c1", pedido("paid", "2026-11-02T10:00:00.000Z"));
    expect(r.status).toBe("ANTES_DA_DATA_DE_IMPORTACAO");
    expect(h.importar).not.toHaveBeenCalled();
  });
  it("pedido pago depois da data vira venda com a forma de pagamento real", async () => {
    const r = await importarPedidoML("c1", pedido("paid", "2026-11-03T10:00:00.000Z"));
    expect(r.status).toBe("IMPORTADO");
    expect(h.importar).toHaveBeenCalledWith(expect.objectContaining({ formaPagamento: "CREDITO", parcelas: 2, bandeiraPagamento: "visa" }));
  });
  it("pedido cancelado aciona o estorno com o externoId ML-<id>", async () => {
    const r = await importarPedidoML("c1", pedido("cancelled", "2026-11-03T10:00:00.000Z"));
    expect(r.status).toBe("CANCELADO");
    expect(h.cancelar).toHaveBeenCalledWith(expect.objectContaining({ empresaId: "emp1", externoId: "ML-2000001" }));
  });
});
