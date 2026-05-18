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
    // Listings Items API — exige SKU; aqui paginamos por relatório
    // (em produção: gerar Report GET_MERCHANT_LISTINGS_ALL_DATA)
    const { data } = await http.get(
      `/listings/2021-08-01/items/${MARKETPLACE_BR}`,
      { params: { marketplaceIds: MARKETPLACE_BR, pageSize: 50 } },
    );
    const items: AmzItemRaw[] = data?.items ?? [];
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
    const { data } = await http.get(`/orders/v0/orders`, {
      params: { MarketplaceIds: MARKETPLACE_BR, CreatedAfter: desde },
    });
    const orders: AmzOrderRaw[] = data?.payload?.Orders ?? [];
    return Promise.all(
      orders.map(async (o) => {
        const { data: itensResp } = await http.get(
          `/orders/v0/orders/${o.AmazonOrderId}/orderItems`,
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
    // Messaging API: solicitations e mensagens de comprador
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
