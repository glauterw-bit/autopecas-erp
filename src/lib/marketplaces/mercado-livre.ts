import axios from "axios";
import { prisma } from "../db";
import type {
  AdaptadorMarketplace,
  AnuncioRemoto,
  MensagemRemota,
  PedidoRemoto,
} from "./types";

// Adaptador Mercado Livre
// =======================
// Cobre o subconjunto crítico para auto peças:
//   - listagem, atualização de estoque/preço
//   - sincronia de pedidos
//   - compatibilidade de auto peças (universal / por catálogo / por atributos)
//   - mensageria pós-venda (alimenta o OmniInbox)
//
// Documentação: https://developers.mercadolivre.com.br
// Auth: OAuth 2.0 (access_token de 6h; refresh_token persistente)

const BASE = "https://api.mercadolibre.com";

export class MercadoLivreAdapter implements AdaptadorMarketplace {
  plataforma = "MERCADO_LIVRE";
  constructor(private readonly contaId: string) {}

  private async getToken(): Promise<string> {
    const conta = await prisma.marketplaceConta.findUniqueOrThrow({
      where: { id: this.contaId },
    });
    if (
      conta.expiraEm &&
      conta.expiraEm.getTime() - Date.now() > 60_000 &&
      conta.accessToken
    ) {
      return conta.accessToken;
    }
    // refresh
    const { data } = await axios.post(`${BASE}/oauth/token`, {
      grant_type: "refresh_token",
      client_id: process.env.ML_APP_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      refresh_token: conta.refreshToken,
    });
    await prisma.marketplaceConta.update({
      where: { id: this.contaId },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? conta.refreshToken,
        expiraEm: new Date(Date.now() + (data.expires_in ?? 21600) * 1000),
      },
    });
    return data.access_token;
  }

  private async axiosInstance() {
    const token = await this.getToken();
    return axios.create({
      baseURL: BASE,
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15_000,
    });
  }

  async listarAnuncios(): Promise<AnuncioRemoto[]> {
    const http = await this.axiosInstance();
    const conta = await prisma.marketplaceConta.findUniqueOrThrow({
      where: { id: this.contaId },
    });
    const sellerId = conta.contaExternaId;
    if (!sellerId) return [];
    const { data: ids } = await http.get(`/users/${sellerId}/items/search`, {
      params: { limit: 50 },
    });
    const itemIds: string[] = ids.results ?? [];
    if (itemIds.length === 0) return [];
    const { data: items } = await http.get<Array<{ body: AnuncioMLRaw }>>(
      `/items`,
      { params: { ids: itemIds.join(","), attributes: "id,title,price,available_quantity,status,permalink,listing_type_id" } },
    );
    return items
      .map((it) => it.body)
      .filter(Boolean)
      .map((b) => ({
        itemIdExterno: b.id,
        titulo: b.title,
        preco: b.price,
        estoque: b.available_quantity,
        status: this.mapearStatus(b.status),
        url: b.permalink,
        tipoListagem: b.listing_type_id,
      }));
  }

  private mapearStatus(s: string): AnuncioRemoto["status"] {
    switch (s) {
      case "active":
        return "ATIVO";
      case "paused":
        return "PAUSADO";
      case "closed":
        return "ENCERRADO";
      case "under_review":
        return "EM_REVISAO";
      default:
        return "ENCERRADO";
    }
  }

  async listarPedidosRecentes(): Promise<PedidoRemoto[]> {
    const http = await this.axiosInstance();
    const conta = await prisma.marketplaceConta.findUniqueOrThrow({
      where: { id: this.contaId },
    });
    const sellerId = conta.contaExternaId;
    if (!sellerId) return [];
    const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data } = await http.get(`/orders/search`, {
      params: { seller: sellerId, "order.date_created.from": desde, limit: 50 },
    });
    type Res = { results: PedidoMLRaw[] };
    const results: PedidoMLRaw[] = (data as Res).results ?? [];
    return results.map((o) => ({
      pedidoIdExterno: String(o.id),
      status: o.status,
      valorTotal: o.total_amount,
      valorFrete: o.shipping?.cost ?? 0,
      feeMarketplace: (o.order_items ?? []).reduce(
        (a, it) => a + (it.sale_fee ?? 0),
        0,
      ),
      dataPedido: new Date(o.date_created),
      comprador: {
        nome: `${o.buyer?.first_name ?? ""} ${o.buyer?.last_name ?? ""}`.trim(),
        email: o.buyer?.email,
        documento: o.buyer?.billing_info?.doc_number,
      },
      itens: (o.order_items ?? []).map((it) => ({
        itemIdExterno: it.item.id,
        titulo: it.item.title,
        quantidade: it.quantity,
        precoUnitario: it.unit_price,
      })),
      payloadOriginal: o,
    }));
  }

  async listarMensagensNaoLidas(): Promise<MensagemRemota[]> {
    const http = await this.axiosInstance();
    const conta = await prisma.marketplaceConta.findUniqueOrThrow({
      where: { id: this.contaId },
    });
    const sellerId = conta.contaExternaId;
    if (!sellerId) return [];
    const { data } = await http.get(
      `/messages/packs/seller/${sellerId}?tag=post_sale`,
    );
    type Msg = { id: string; from: { user_id: string }; text: string; message_date: { received: string } };
    const msgs: Msg[] = data?.messages ?? [];
    return msgs.map((m) => ({
      conversaIdExterno: m.id,
      remetente: String(m.from.user_id),
      texto: m.text,
      recebidaEm: new Date(m.message_date.received),
    }));
  }

  async atualizarEstoque(itemIdExterno: string, quantidade: number) {
    const http = await this.axiosInstance();
    await http.put(`/items/${itemIdExterno}`, { available_quantity: quantidade });
  }
  async atualizarPreco(itemIdExterno: string, preco: number) {
    const http = await this.axiosInstance();
    await http.put(`/items/${itemIdExterno}`, { price: preco });
  }

  async enviarMensagem(conversaIdExterno: string, texto: string) {
    const http = await this.axiosInstance();
    await http.post(`/messages`, { conversation_id: conversaIdExterno, text: texto });
  }

  // Compatibilidade de auto peças — recurso essencial do ML para esse nicho.
  // Permite vincular o anúncio a montadoras/modelos/versões do catálogo do ML.
  async definirCompatibilidades(
    userProductId: string,
    compatibilidades: Array<{ catalogProductId?: string; brand?: string; model?: string; year?: number }>,
  ) {
    const http = await this.axiosInstance();
    await http.put(`/user-products/${userProductId}/compatibilities`, {
      compatibilities: compatibilidades,
    });
  }
}

type AnuncioMLRaw = {
  id: string;
  title: string;
  price: number;
  available_quantity: number;
  status: string;
  permalink?: string;
  listing_type_id?: string;
};

type PedidoMLRaw = {
  id: number | string;
  status: string;
  total_amount: number;
  date_created: string;
  shipping?: { cost?: number };
  buyer?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    billing_info?: { doc_number?: string };
  };
  order_items?: Array<{
    item: { id: string; title: string };
    quantity: number;
    unit_price: number;
    sale_fee?: number;
  }>;
};
