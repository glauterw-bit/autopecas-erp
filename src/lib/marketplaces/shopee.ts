import axios from "axios";
import crypto from "node:crypto";
import { prisma } from "../db";
import type {
  AdaptadorMarketplace,
  AnuncioRemoto,
  MensagemRemota,
  PedidoRemoto,
} from "./types";
import { lerTokenConta } from "./tokens";

// Adaptador Shopee Open Platform
// =============================
// Esqueleto que assina requests no padrão Shopee (HMAC-SHA256).
// A Shopee tem categoria específica para auto peças (cresceu muito 2024-2026).

const BASE = "https://partner.shopeemobile.com";

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
      accessToken: lerTokenConta(conta.accessToken) ?? "",
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
    // Paginação via response.more/next_offset (get_item_list também expõe
    // has_next_page — aceitamos os dois), cap MAX_PAGINAS.
    const ids: number[] = [];
    let offset = 0;
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const list = await comRetry(() =>
        this.http("/api/v2/product/get_item_list", {
          offset,
          page_size: 100,
          item_status: "NORMAL",
        }),
      );
      const pageIds: number[] = (list.response?.item ?? []).map(
        (i: { item_id: number }) => i.item_id,
      );
      ids.push(...pageIds);
      const more: boolean =
        list.response?.more ?? list.response?.has_next_page ?? false;
      if (!more || pageIds.length === 0) break;
      offset = Number(list.response?.next_offset ?? offset + pageIds.length);
    }
    if (ids.length === 0) return [];
    type ShopeeItem = {
      item_id: number;
      item_name: string;
      item_status: string;
      price_info?: { current_price: number };
      stock_info?: { current_stock: number };
    };
    // get_item_base_info aceita no máx. 50 ids por chamada.
    const itens: ShopeeItem[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const det = await comRetry(() =>
        this.http("/api/v2/product/get_item_base_info", {
          item_id_list: ids.slice(i, i + 50).join(","),
        }),
      );
      itens.push(...(det.response?.item_list ?? []));
    }
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
    // Paginação via response.more + cursor (next_offset/next_cursor),
    // cap MAX_PAGINAS.
    const orderSns: string[] = [];
    let cursor = "";
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const data = await comRetry(() =>
        this.http("/api/v2/order/get_order_list", {
          time_range_field: "create_time",
          time_from: ts - 86400,
          time_to: ts,
          page_size: 50,
          ...(cursor ? { cursor } : {}),
        }),
      );
      const pageSns: string[] = (data.response?.order_list ?? []).map(
        (o: { order_sn: string }) => o.order_sn,
      );
      orderSns.push(...pageSns);
      const more: boolean = data.response?.more ?? false;
      if (!more || pageSns.length === 0) break;
      cursor = String(
        data.response?.next_offset ?? data.response?.next_cursor ?? "",
      );
      if (!cursor) break;
    }
    if (orderSns.length === 0) return [];
    type ShopeeOrder = {
      order_sn: string;
      order_status: string;
      total_amount: number;
      actual_shipping_fee?: number;
      create_time: number;
      buyer_username?: string;
      item_list: Array<{ item_id: number; item_name: string; model_quantity_purchased: number; model_discounted_price: number }>;
    };
    // get_order_detail aceita no máx. 50 order_sn por chamada.
    const pedidos: ShopeeOrder[] = [];
    for (let i = 0; i < orderSns.length; i += 50) {
      const det = await comRetry(() =>
        this.http("/api/v2/order/get_order_detail", {
          order_sn_list: orderSns.slice(i, i + 50).join(","),
          response_optional_fields: "buyer_user_id,buyer_username,item_list,recipient_address,total_amount,actual_shipping_fee",
        }),
      );
      pedidos.push(...(det.response?.order_list ?? []));
    }
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
    // Conversas não lidas via /api/v2/sellerchat/get_conversation_list e o
    // texto mais recente via /api/v2/sellerchat/get_message.
    // Shape idêntico ao do MercadoLivreAdapter (consumido em unified.ts:
    // dedup por conversaIdExterno + persistência em MensagemMarketplace).
    type ShopeeConversa = {
      conversation_id: number | string;
      to_id?: number;
      to_name?: string;
      unread_count?: number;
      latest_message_content?: { text?: string };
      last_message_timestamp?: number; // nanossegundos
    };
    const conversas: ShopeeConversa[] = [];
    let nextTimestampNano: string | undefined;
    let nextConversationId: string | undefined;
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const data = await comRetry(() =>
        this.http("/api/v2/sellerchat/get_conversation_list", {
          direction: "latest",
          type: "unread",
          page_size: 50,
          ...(nextTimestampNano
            ? {
                next_timestamp_nano: nextTimestampNano,
                conversation_id: nextConversationId,
              }
            : {}),
        }),
      );
      const pageConvs: ShopeeConversa[] = data.response?.conversations ?? [];
      conversas.push(...pageConvs);
      const cursor = data.response?.page_result?.next_cursor;
      if (!cursor?.next_message_time_nano || pageConvs.length === 0) break;
      nextTimestampNano = String(cursor.next_message_time_nano);
      nextConversationId = String(cursor.conversation_id ?? "");
    }

    const mensagens: MensagemRemota[] = [];
    for (const c of conversas) {
      if ((c.unread_count ?? 0) === 0) continue;
      // Texto mais recente da conversa (fallback: latest_message_content).
      let texto = c.latest_message_content?.text ?? "";
      let recebidaEm = c.last_message_timestamp
        ? new Date(Math.floor(c.last_message_timestamp / 1e6))
        : new Date();
      let remetente = c.to_name ?? String(c.to_id ?? c.conversation_id);
      try {
        const det = await comRetry(() =>
          this.http("/api/v2/sellerchat/get_message", {
            conversation_id: c.conversation_id,
            page_size: 1,
          }),
        );
        type ShopeeMsg = {
          message_type?: string;
          content?: { text?: string };
          from_id?: number;
          created_timestamp?: number; // segundos
        };
        const ultima: ShopeeMsg | undefined = (det.response?.messages ?? [])[0];
        if (ultima) {
          texto = ultima.content?.text ?? texto;
          if (ultima.created_timestamp) {
            recebidaEm = new Date(ultima.created_timestamp * 1000);
          }
          if (ultima.from_id) remetente = String(ultima.from_id);
        }
      } catch {
        // mantém o fallback da conversa — não derruba o sync por 1 conversa
      }
      mensagens.push({
        // to_id (id do comprador) para o enviarMensagem() abaixo funcionar
        // com o mesmo identificador que persistimos.
        conversaIdExterno: String(c.to_id ?? c.conversation_id),
        remetente,
        texto,
        recebidaEm,
      });
    }
    return mensagens;
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
