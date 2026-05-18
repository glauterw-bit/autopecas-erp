import axios from "axios";
import crypto from "node:crypto";
import { prisma } from "../db";
import type {
  AdaptadorMarketplace,
  AnuncioRemoto,
  MensagemRemota,
  PedidoRemoto,
} from "./types";

// Adaptador Shopee Open Platform
// =============================
// Esqueleto que assina requests no padrão Shopee (HMAC-SHA256).
// A Shopee tem categoria específica para auto peças (cresceu muito 2024-2026).

const BASE = "https://partner.shopeemobile.com";

export class ShopeeAdapter implements AdaptadorMarketplace {
  plataforma = "SHOPEE";
  constructor(private readonly contaId: string) {}

  private async creds() {
    const conta = await prisma.marketplaceConta.findUniqueOrThrow({
      where: { id: this.contaId },
    });
    return {
      partnerId: Number(process.env.SHOPEE_PARTNER_ID ?? 0),
      partnerKey: process.env.SHOPEE_PARTNER_KEY ?? "",
      shopId: Number(conta.contaExternaId ?? 0),
      accessToken: conta.accessToken ?? "",
    };
  }

  private sign(path: string, timestamp: number, partnerId: number, partnerKey: string, shopId: number, accessToken: string) {
    const baseString = `${partnerId}${path}${timestamp}${accessToken}${shopId}`;
    return crypto.createHmac("sha256", partnerKey).update(baseString).digest("hex");
  }

  private async http(path: string, params: Record<string, unknown> = {}, method: "GET" | "POST" = "GET", body?: unknown) {
    const c = await this.creds();
    const ts = Math.floor(Date.now() / 1000);
    const sign = this.sign(path, ts, c.partnerId, c.partnerKey, c.shopId, c.accessToken);
    const url = `${BASE}${path}`;
    const config = {
      params: {
        partner_id: c.partnerId,
        timestamp: ts,
        access_token: c.accessToken,
        shop_id: c.shopId,
        sign,
        ...params,
      },
    };
    if (method === "GET") return axios.get(url, config).then((r) => r.data);
    return axios.post(url, body, config).then((r) => r.data);
  }

  async listarAnuncios(): Promise<AnuncioRemoto[]> {
    const list = await this.http("/api/v2/product/get_item_list", {
      offset: 0,
      page_size: 100,
      item_status: "NORMAL",
    });
    const ids: number[] = (list.response?.item ?? []).map((i: { item_id: number }) => i.item_id);
    if (ids.length === 0) return [];
    const det = await this.http("/api/v2/product/get_item_base_info", {
      item_id_list: ids.join(","),
    });
    type ShopeeItem = {
      item_id: number;
      item_name: string;
      item_status: string;
      price_info?: { current_price: number };
      stock_info?: { current_stock: number };
    };
    const itens: ShopeeItem[] = det.response?.item_list ?? [];
    return itens.map((it) => ({
      itemIdExterno: String(it.item_id),
      titulo: it.item_name,
      preco: it.price_info?.current_price ?? 0,
      estoque: it.stock_info?.current_stock ?? 0,
      status: it.item_status === "NORMAL" ? "ATIVO" : "PAUSADO",
    }));
  }

  async listarPedidosRecentes(): Promise<PedidoRemoto[]> {
    const ts = Math.floor(Date.now() / 1000);
    const data = await this.http("/api/v2/order/get_order_list", {
      time_range_field: "create_time",
      time_from: ts - 86400,
      time_to: ts,
      page_size: 50,
    });
    const orderSns: string[] = (data.response?.order_list ?? []).map(
      (o: { order_sn: string }) => o.order_sn,
    );
    if (orderSns.length === 0) return [];
    const det = await this.http("/api/v2/order/get_order_detail", {
      order_sn_list: orderSns.join(","),
      response_optional_fields: "buyer_user_id,buyer_username,item_list,recipient_address,total_amount,actual_shipping_fee",
    });
    type ShopeeOrder = {
      order_sn: string;
      order_status: string;
      total_amount: number;
      actual_shipping_fee?: number;
      create_time: number;
      buyer_username?: string;
      item_list: Array<{ item_id: number; item_name: string; model_quantity_purchased: number; model_discounted_price: number }>;
    };
    const pedidos: ShopeeOrder[] = det.response?.order_list ?? [];
    return pedidos.map((o) => ({
      pedidoIdExterno: o.order_sn,
      status: o.order_status,
      valorTotal: o.total_amount,
      valorFrete: o.actual_shipping_fee ?? 0,
      feeMarketplace: 0,
      dataPedido: new Date(o.create_time * 1000),
      comprador: { nome: o.buyer_username ?? "Cliente Shopee" },
      itens: o.item_list.map((it) => ({
        itemIdExterno: String(it.item_id),
        titulo: it.item_name,
        quantidade: it.model_quantity_purchased,
        precoUnitario: it.model_discounted_price,
      })),
      payloadOriginal: o,
    }));
  }

  async listarMensagensNaoLidas(): Promise<MensagemRemota[]> {
    // Shopee tem endpoint sns/chat — implementação real lê /api/v2/sellerchat/get_message_list
    return [];
  }

  async atualizarEstoque(itemIdExterno: string, quantidade: number) {
    await this.http(
      "/api/v2/product/update_stock",
      {},
      "POST",
      {
        item_id: Number(itemIdExterno),
        stock_list: [{ model_id: 0, normal_stock: quantidade }],
      },
    );
  }

  async atualizarPreco(itemIdExterno: string, preco: number) {
    await this.http(
      "/api/v2/product/update_price",
      {},
      "POST",
      {
        item_id: Number(itemIdExterno),
        price_list: [{ model_id: 0, original_price: preco }],
      },
    );
  }

  async enviarMensagem(conversaIdExterno: string, texto: string) {
    await this.http(
      "/api/v2/sellerchat/send_message",
      {},
      "POST",
      {
        to_id: Number(conversaIdExterno),
        message_type: "text",
        content: { text: texto },
      },
    );
  }
}
