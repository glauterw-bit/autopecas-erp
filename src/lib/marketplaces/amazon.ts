import axios from "axios";
import crypto from "node:crypto";
import { prisma } from "../db";
import type {
  AdaptadorMarketplace,
  AnuncioRemoto,
  MensagemRemota,
  PedidoRemoto,
} from "./types";

// Adaptador Amazon SP-API (Selling Partner API)
// =============================================
// SP-API exige LWA OAuth (Login with Amazon) + assinatura SigV4 das
// requisições. Mantemos um access_token cacheado e renovado pelo refresh_token.
// Marketplace ID Brasil: A2Q3Y263D00KWC

const LWA_URL = "https://api.amazon.com/auth/o2/token";
const SP_API_BASE = "https://sellingpartnerapi-na.amazon.com"; // Brasil usa NA endpoint
const MARKETPLACE_BR = "A2Q3Y263D00KWC";

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

// Aviso único (por processo) sobre a Messaging API restrita.
let avisouMensagensRestritas = false;

export class AmazonAdapter implements AdaptadorMarketplace {
  plataforma = "AMAZON";
  constructor(private readonly contaId: string) {}

  private async getAccessToken(): Promise<string> {
    const conta = await prisma.marketplaceConta.findUniqueOrThrow({
      where: { id: this.contaId },
    });
    if (
      conta.accessToken &&
      conta.expiraEm &&
      conta.expiraEm.getTime() - Date.now() > 60_000
    ) {
      return conta.accessToken;
    }
    const { data } = await axios.post(LWA_URL, {
      grant_type: "refresh_token",
      refresh_token: conta.refreshToken ?? process.env.AMAZON_REFRESH_TOKEN,
      client_id: process.env.AMAZON_LWA_CLIENT_ID,
      client_secret: process.env.AMAZON_LWA_CLIENT_SECRET,
    });
    await prisma.marketplaceConta.update({
      where: { id: this.contaId },
      data: {
        accessToken: data.access_token,
        expiraEm: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
      },
    });
    return data.access_token;
  }

  private async http() {
    const token = await this.getAccessToken();
    return axios.create({
      baseURL: SP_API_BASE,
      timeout: 20_000,
      headers: { "x-amz-access-token": token },
    });
  }

  async listarAnuncios(): Promise<AnuncioRemoto[]> {
    const http = await this.http();
    // Listings Items API — pagina via pagination.nextToken (cap MAX_PAGINAS).
    // (em produção: gerar Report GET_MERCHANT_LISTINGS_ALL_DATA)
    const items: AmzItemRaw[] = [];
    let nextToken: string | undefined;
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const { data } = await comRetry(() =>
        http.get(`/listings/2021-08-01/items/${MARKETPLACE_BR}`, {
          params: {
            marketplaceIds: MARKETPLACE_BR,
            pageSize: 50,
            ...(nextToken ? { pageToken: nextToken } : {}),
          },
        }),
      );
      const pageItems: AmzItemRaw[] = data?.items ?? [];
      items.push(...pageItems);
      nextToken = data?.pagination?.nextToken;
      if (!nextToken || pageItems.length === 0) break;
    }
    return items.map((it) => ({
      itemIdExterno: it.sku,
      titulo: it.attributes?.item_name?.[0]?.value ?? it.sku,
      preco: it.attributes?.list_price?.[0]?.value ?? 0,
      estoque: it.fulfillmentAvailability?.[0]?.quantity ?? 0,
      status: it.summaries?.[0]?.status === "BUYABLE" ? "ATIVO" : "PAUSADO",
    }));
  }

  async listarPedidosRecentes(): Promise<PedidoRemoto[]> {
    const http = await this.http();
    const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    // Orders API — pagina via payload.NextToken (cap MAX_PAGINAS).
    const orders: AmzOrderRaw[] = [];
    let nextToken: string | undefined;
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const { data } = await comRetry(() =>
        http.get(`/orders/v0/orders`, {
          params: {
            MarketplaceIds: MARKETPLACE_BR,
            CreatedAfter: desde,
            ...(nextToken ? { NextToken: nextToken } : {}),
          },
        }),
      );
      const pageOrders: AmzOrderRaw[] = data?.payload?.Orders ?? [];
      orders.push(...pageOrders);
      nextToken = data?.payload?.NextToken;
      if (!nextToken || pageOrders.length === 0) break;
    }
    return Promise.all(
      orders.map(async (o) => {
        const { data: itensResp } = await comRetry(() =>
          http.get(`/orders/v0/orders/${o.AmazonOrderId}/orderItems`),
        );
        const itensRaw: AmzOrderItemRaw[] =
          itensResp?.payload?.OrderItems ?? [];
        return {
          pedidoIdExterno: o.AmazonOrderId,
          status: o.OrderStatus,
          valorTotal: Number(o.OrderTotal?.Amount ?? 0),
          valorFrete: 0,
          feeMarketplace: 0,
          dataPedido: new Date(o.PurchaseDate),
          comprador: { nome: o.BuyerInfo?.BuyerName ?? "Cliente Amazon" },
          itens: itensRaw.map((it) => ({
            itemIdExterno: it.ASIN,
            titulo: it.Title,
            quantidade: it.QuantityOrdered,
            precoUnitario: Number(it.ItemPrice?.Amount ?? 0),
          })),
          payloadOriginal: o,
        };
      }),
    );
  }

  async listarMensagensNaoLidas(): Promise<MensagemRemota[]> {
    // A Amazon Messaging API (e a leitura de mensagens de comprador) é
    // restrita a aplicações aprovadas no programa de Restricted Data Token /
    // roles específicas ("Buyer Communication"). Sem a aprovação do app na
    // Seller Central, qualquer chamada retorna 403. Mantemos o stub
    // retornando [] até o app ter a role liberada.
    if (!avisouMensagensRestritas) {
      avisouMensagensRestritas = true;
      console.warn(
        "[amazon] Messaging API restrita a apps aprovados — listarMensagensNaoLidas retorna [] até liberação da role Buyer Communication.",
      );
    }
    return [];
  }

  async atualizarEstoque(sku: string, quantidade: number) {
    const http = await this.http();
    await http.patch(
      `/listings/2021-08-01/items/${MARKETPLACE_BR}/${encodeURIComponent(sku)}`,
      {
        productType: "AUTO_PART",
        patches: [
          {
            op: "replace",
            path: "/attributes/fulfillment_availability",
            value: [{ fulfillment_channel_code: "DEFAULT", quantity: quantidade }],
          },
        ],
      },
      { params: { marketplaceIds: MARKETPLACE_BR } },
    );
  }

  async atualizarPreco(sku: string, preco: number) {
    const http = await this.http();
    await http.patch(
      `/listings/2021-08-01/items/${MARKETPLACE_BR}/${encodeURIComponent(sku)}`,
      {
        productType: "AUTO_PART",
        patches: [
          {
            op: "replace",
            path: "/attributes/list_price",
            value: [{ currency: "BRL", value: preco }],
          },
        ],
      },
      { params: { marketplaceIds: MARKETPLACE_BR } },
    );
  }

  async enviarMensagem(orderId: string, texto: string) {
    const http = await this.http();
    await http.post(`/messaging/v1/orders/${orderId}/messages/confirmCustomizationDetails`, {
      text: texto,
    });
  }

  // Util: assinatura SigV4 (caso seja exigida em endpoints específicos)
  // Mantida para uso futuro em report polling/feed submission.
  static sigV4(
    method: string,
    path: string,
    payload: string,
    accessKey: string,
    secretKey: string,
    region = "us-east-1",
  ) {
    const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = now.slice(0, 8);
    const service = "execute-api";
    const credentialScope = `${date}/${region}/${service}/aws4_request`;
    const hashedPayload = crypto.createHash("sha256").update(payload).digest("hex");
    const canonical = `${method}\n${path}\n\nhost:sellingpartnerapi-na.amazon.com\nx-amz-date:${now}\n\nhost;x-amz-date\n${hashedPayload}`;
    const hashedCanonical = crypto.createHash("sha256").update(canonical).digest("hex");
    const stringToSign = `AWS4-HMAC-SHA256\n${now}\n${credentialScope}\n${hashedCanonical}`;
    const kDate = crypto.createHmac("sha256", "AWS4" + secretKey).update(date).digest();
    const kRegion = crypto.createHmac("sha256", kDate).update(region).digest();
    const kService = crypto.createHmac("sha256", kRegion).update(service).digest();
    const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest();
    const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");
    return {
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=host;x-amz-date, Signature=${signature}`,
      "x-amz-date": now,
    };
  }
}

type AmzItemRaw = {
  sku: string;
  attributes?: {
    item_name?: Array<{ value: string }>;
    list_price?: Array<{ value: number }>;
  };
  fulfillmentAvailability?: Array<{ quantity: number }>;
  summaries?: Array<{ status: string }>;
};
type AmzOrderRaw = {
  AmazonOrderId: string;
  OrderStatus: string;
  OrderTotal?: { Amount: string };
  PurchaseDate: string;
  BuyerInfo?: { BuyerName?: string };
};
type AmzOrderItemRaw = {
  ASIN: string;
  Title: string;
  QuantityOrdered: number;
  ItemPrice?: { Amount: string };
};
