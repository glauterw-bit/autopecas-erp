import axios from "axios";
import { prisma } from "../db";
import type {
  AdaptadorMarketplace,
  AnuncioRemoto,
  MensagemRemota,
  PedidoRemoto,
} from "./types";
import { lerTokenConta } from "./tokens";

// Adaptador Magalu (Magazine Luiza Marketplace)
// =============================================
// API REST com Bearer token. Endpoints relevantes:
//   /portfolio/v1/portfolios — anúncios do seller
//   /orders/v1/orders        — pedidos
//   /pricing/v1/prices       — preços
//   /stocks/v1/stocks        — estoque

const BASE = "https://api.magalu.com";

// Cap de segurança para loops de paginação.
const MAX_PAGINAS = 20;

// Retry para rate limit / indisponibilidade: em 429 ou 503 lê Retry-After
// (segundos, máx 30s de espera) e tenta de novo — máx 3 tentativas.
// Duplicado em cada adaptador de propósito (arquivos têm donos diferentes).
async function comRetry<T>(fn: () => Promise<T>): Promise<T> {
  let tentativa = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      tentativa++;
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      if ((status !== 429 && status !== 503) || tentativa >= 3) throw e;
      const retryAfter = Number(
        axios.isAxiosError(e) ? e.response?.headers?.["retry-after"] : NaN,
      );
      const segundos =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1;
      await new Promise((r) => setTimeout(r, Math.min(segundos, 30) * 1000));
    }
  }
}

// Aviso único (por processo) sobre mensagens indisponíveis via REST.
let avisouMensagensViaWebhook = false;

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
      headers: { Authorization: `Bearer ${lerTokenConta(conta.accessToken) ?? ""}` },
    });
  }

  async listarAnuncios(): Promise<AnuncioRemoto[]> {
    const http = await this.http();
    // Paginação via _offset/_limit até a página vir incompleta (cap MAX_PAGINAS).
    const limit = 100;
    let offset = 0;
    const items: MagaluAdRaw[] = [];
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const { data } = await comRetry(() =>
        http.get(`/portfolio/v1/portfolios`, {
          params: { _limit: limit, _offset: offset },
        }),
      );
      const pageItems: MagaluAdRaw[] = data?.data ?? [];
      items.push(...pageItems);
      if (pageItems.length < limit) break;
      offset += limit;
    }
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
    // Paginação via _offset/_limit até a página vir incompleta (cap MAX_PAGINAS).
    const limit = 50;
    let offset = 0;
    const orders: MagaluOrderRaw[] = [];
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const { data } = await comRetry(() =>
        http.get(`/orders/v1/orders`, {
          params: { created_after: desde, _limit: limit, _offset: offset },
        }),
      );
      const pageOrders: MagaluOrderRaw[] = data?.data ?? [];
      orders.push(...pageOrders);
      if (pageOrders.length < limit) break;
      offset += limit;
    }
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
    // A Magalu não expõe inbox unificado via REST para polling — as mensagens
    // do cliente chegam exclusivamente via webhook (assinado no portal de
    // integração e recebido em /api/webhooks/marketplaces?plataforma=MAGALU).
    // O stub retorna [] de propósito; o fluxo real é orientado a eventos.
    if (!avisouMensagensViaWebhook) {
      avisouMensagensViaWebhook = true;
      console.warn(
        "[magalu] Sem API de polling de mensagens — mensagens chegam via webhook; listarMensagensNaoLidas retorna [].",
      );
    }
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
