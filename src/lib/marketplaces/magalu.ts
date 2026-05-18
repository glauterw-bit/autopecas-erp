import axios from "axios";
import { prisma } from "../db";
import type {
  AdaptadorMarketplace,
  AnuncioRemoto,
  MensagemRemota,
  PedidoRemoto,
} from "./types";

// Adaptador Magalu (Magazine Luiza Marketplace)
// =============================================
// API REST com Bearer token. Endpoints relevantes:
//   /portfolio/v1/portfolios — anúncios do seller
//   /orders/v1/orders        — pedidos
//   /pricing/v1/prices       — preços
//   /stocks/v1/stocks        — estoque

const BASE = "https://api.magalu.com";

export class MagaluAdapter implements AdaptadorMarketplace {
  plataforma = "MAGALU";
  constructor(private readonly contaId: string) {}

  private async http() {
    const conta = await prisma.marketplaceConta.findUniqueOrThrow({
      where: { id: this.contaId },
    });
    return axios.create({
      baseURL: BASE,
      timeout: 15_000,
      headers: { Authorization: `Bearer ${conta.accessToken ?? ""}` },
    });
  }

  async listarAnuncios(): Promise<AnuncioRemoto[]> {
    const http = await this.http();
    const { data } = await http.get(`/portfolio/v1/portfolios`, {
      params: { _limit: 100 },
    });
    const items: MagaluAdRaw[] = data?.data ?? [];
    return items.map((it) => ({
      itemIdExterno: it.sku,
      titulo: it.title,
      preco: it.price ?? 0,
      estoque: it.stock ?? 0,
      status: it.status === "ACTIVE" ? "ATIVO" : "PAUSADO",
    }));
  }

  async listarPedidosRecentes(): Promise<PedidoRemoto[]> {
    const http = await this.http();
    const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data } = await http.get(`/orders/v1/orders`, {
      params: { created_after: desde, _limit: 50 },
    });
    const orders: MagaluOrderRaw[] = data?.data ?? [];
    return orders.map((o) => ({
      pedidoIdExterno: o.id,
      status: o.status,
      valorTotal: o.total_amount,
      valorFrete: o.shipping_amount ?? 0,
      feeMarketplace: o.commission_amount ?? 0,
      dataPedido: new Date(o.created_at),
      comprador: {
        nome: `${o.customer?.first_name ?? ""} ${o.customer?.last_name ?? ""}`.trim(),
        documento: o.customer?.document,
        email: o.customer?.email,
      },
      itens: (o.items ?? []).map((it) => ({
        itemIdExterno: it.sku,
        titulo: it.title,
        quantidade: it.quantity,
        precoUnitario: it.unit_price,
      })),
      payloadOriginal: o,
    }));
  }

  async listarMensagensNaoLidas(): Promise<MensagemRemota[]> {
    // Magalu não expõe inbox unificado; mensagens chegam via webhook.
    return [];
  }

  async atualizarEstoque(sku: string, quantidade: number) {
    const http = await this.http();
    await http.put(`/stocks/v1/stocks/${encodeURIComponent(sku)}`, {
      stock: quantidade,
    });
  }

  async atualizarPreco(sku: string, preco: number) {
    const http = await this.http();
    await http.put(`/pricing/v1/prices/${encodeURIComponent(sku)}`, {
      price: preco,
    });
  }

  async enviarMensagem(_orderId: string, _texto: string) {
    // Sem endpoint público — Magalu usa Olist (canal indireto). Placeholder.
  }
}

type MagaluAdRaw = {
  sku: string;
  title: string;
  price?: number;
  stock?: number;
  status?: string;
};
type MagaluOrderRaw = {
  id: string;
  status: string;
  total_amount: number;
  shipping_amount?: number;
  commission_amount?: number;
  created_at: string;
  customer?: { first_name?: string; last_name?: string; document?: string; email?: string };
  items?: Array<{ sku: string; title: string; quantity: number; unit_price: number }>;
};
