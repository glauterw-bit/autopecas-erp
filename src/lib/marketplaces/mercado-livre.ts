import axios, { type AxiosRequestConfig } from "axios";
import { comRetryML, listarIdsPorScan, type OpcoesRetry, type PaginaScan } from "./ml-http";
import { prisma } from "../db";
import type {
  AdaptadorMarketplace,
  AnuncioRemoto,
  MensagemRemota,
  PedidoRemoto,
} from "./types";
import { lerTokenConta, tokensParaGravar } from "./tokens";

// Adaptador Mercado Livre
// =======================
// Cobre o subconjunto crítico para auto peças:
//   - listagem, atualização de estoque/preço
//   - sincronia de pedidos
//   - compatibilidade de autopeças (./ml-compatibilidades.ts)
//   - pedido pago vira Venda (./pedido-ml.ts)
//   - mensageria pós-venda (alimenta o OmniInbox)
//
// Documentação: https://developers.mercadolivre.com.br
// Auth: OAuth 2.0 (access_token de 6h; refresh_token de uso único, renovado
// sob trava por conta). Toda chamada passa por `req`: retry com backoff
// exponencial + jitter em 429/5xx (respeita Retry-After) e paginação por scan.

const BASE = "https://api.mercadolibre.com";

/** Erro do ML sem headers nem corpo da requisição (o token vai no header). */
export class ErroML extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly codigo?: string,
  ) {
    super(message);
    this.name = "ErroML";
  }
}

export function erroMLSeguro(e: unknown, etapa: string): ErroML {
  if (e instanceof ErroML) return e;
  if (axios.isAxiosError(e)) {
    const status = e.response?.status;
    const d = e.response?.data as { error?: string; message?: string } | undefined;
    const codigo = String(d?.error ?? e.code ?? "erro").slice(0, 60);
    return new ErroML(`Mercado Livre (${etapa}) respondeu ${status ?? "sem resposta"}: ${codigo}`, status, codigo);
  }
  return new ErroML(`Mercado Livre (${etapa}) falhou`);
}

/** Corpo do POST /oauth/token (refresh), form-urlencoded. */
export function corpoRefreshML(refreshToken: string, env: NodeJS.ProcessEnv = process.env): string {
  return new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env.ML_APP_ID ?? "",
    client_secret: env.ML_CLIENT_SECRET ?? "",
    refresh_token: refreshToken,
  }).toString();
}

/** Cliente mínimo usado por compatibilidades/pedidos (facilita teste com fake). */
export interface ClienteML {
  req<T = unknown>(config: AxiosRequestConfig, etapa?: string): Promise<T>;
}

export class MercadoLivreAdapter implements AdaptadorMarketplace, ClienteML {
  plataforma = "MERCADO_LIVRE";
  private tokenAtual?: { valor: string; expiraEm: number };
  constructor(
    private readonly contaId: string,
    private readonly opcoesRetry: OpcoesRetry = {},
  ) {}

  // Refresh de token com trava: o refresh_token do ML é de uso único, então
  // dois processos (web + worker) renovando ao mesmo tempo queimariam a conta.
  // O advisory lock por conta serializa entre processos; quem chega depois
  // relê o token já renovado.
  private async getToken(forcar = false): Promise<string> {
    if (!forcar && this.tokenAtual && this.tokenAtual.expiraEm - Date.now() > 5 * 60_000) {
      return this.tokenAtual.valor;
    }
    const conta = await prisma.marketplaceConta.findUniqueOrThrow({
      where: { id: this.contaId },
      select: { accessToken: true, expiraEm: true },
    });
    if (!forcar && conta.accessToken && conta.expiraEm && conta.expiraEm.getTime() - Date.now() > 5 * 60_000) {
      const valor = lerTokenConta(conta.accessToken)!;
      this.tokenAtual = { valor, expiraEm: conta.expiraEm.getTime() };
      return valor;
    }
    const tokenVelho = conta.accessToken;
    try {
      const novo = await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"ml-token:" + this.contaId}))`;
          const atual = await tx.marketplaceConta.findUniqueOrThrow({
            where: { id: this.contaId },
            select: { accessToken: true, refreshToken: true, expiraEm: true },
          });
          // Outro processo renovou enquanto esperávamos a trava.
          if (
            atual.accessToken &&
            atual.accessToken !== tokenVelho &&
            atual.expiraEm &&
            atual.expiraEm.getTime() - Date.now() > 60_000
          ) {
            return { valor: lerTokenConta(atual.accessToken)!, expiraEm: atual.expiraEm.getTime() };
          }
          if (!atual.refreshToken) {
            throw new ErroML("Conta do Mercado Livre sem autorização: reconecte a conta", 401, "sem_refresh");
          }
          const { data } = await comRetryML(
            () =>
              axios.post(`${BASE}/oauth/token`, corpoRefreshML(lerTokenConta(atual.refreshToken)!), {
                headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
                timeout: 15_000,
              }),
            { ...this.opcoesRetry, maxTentativas: 3 },
          );
          const expiraEm = Date.now() + Number(data.expires_in ?? 21600) * 1000;
          await tx.marketplaceConta.update({
            where: { id: this.contaId },
            data: {
              ...tokensParaGravar({
                accessToken: data.access_token as string,
                refreshToken: (data.refresh_token as string | undefined) ?? atual.refreshToken,
              }),
              expiraEm: new Date(expiraEm),
            },
          });
          return { valor: data.access_token as string, expiraEm };
        },
        { timeout: 30_000, maxWait: 30_000 },
      );
      this.tokenAtual = novo;
      return novo.valor;
    } catch (e) {
      const err = erroMLSeguro(e, "renovar token");
      if (err.codigo === "invalid_grant") {
        // Refresh revogado/expirado: a conta precisa ser reconectada.
        await prisma.marketplaceConta
          .update({ where: { id: this.contaId }, data: { accessToken: null, expiraEm: null } })
          .catch(() => undefined);
      }
      throw err;
    }
  }

  /**
   * Chamada autenticada com retry (429/5xx/rede com backoff exponencial +
   * jitter, respeitando Retry-After) e uma renovação de token em 401.
   */
  async req<T = unknown>(config: AxiosRequestConfig, etapa = "api"): Promise<T> {
    const exec = async (token: string) =>
      (
        await comRetryML(
          () =>
            axios.request<T>({
              baseURL: BASE,
              timeout: 15_000,
              ...config,
              headers: { ...((config.headers as Record<string, string>) ?? {}), Authorization: `Bearer ${token}` },
            }),
          this.opcoesRetry,
        )
      ).data;
    try {
      return await exec(await this.getToken());
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 401) {
        try {
          return await exec(await this.getToken(true));
        } catch (e2) {
          throw erroMLSeguro(e2, etapa);
        }
      }
      throw erroMLSeguro(e, etapa);
    }
  }

  private async sellerId(): Promise<string | null> {
    const conta = await prisma.marketplaceConta.findUniqueOrThrow({
      where: { id: this.contaId },
      select: { contaExternaId: true },
    });
    return conta.contaExternaId;
  }

  /** Todos os ids de anúncio do vendedor (scan/scroll, sem teto de 1.000). */
  async listarIdsAnuncios(): Promise<string[]> {
    const sellerId = await this.sellerId();
    if (!sellerId) return [];
    return listarIdsPorScan((params) =>
      this.req<PaginaScan>({ method: "GET", url: `/users/${sellerId}/items/search`, params }, "listar anúncios"),
    );
  }

  async listarAnuncios(): Promise<AnuncioRemoto[]> {
    const itemIds = await this.listarIdsAnuncios();
    if (itemIds.length === 0) return [];
    // Multiget de /items aceita no máx. 20 ids por chamada.
    const bodies: AnuncioMLRaw[] = [];
    for (let i = 0; i < itemIds.length; i += 20) {
      const lote = itemIds.slice(i, i + 20);
      const items = await this.req<Array<{ code?: number; body: AnuncioMLRaw }>>(
        {
          method: "GET",
          url: `/items`,
          params: {
            ids: lote.join(","),
            attributes:
              "id,title,price,available_quantity,status,permalink,listing_type_id,seller_custom_field,attributes,catalog_product_id,catalog_listing",
          },
        },
        "multiget de anúncios",
      );
      bodies.push(...items.filter((it) => !it.code || it.code === 200).map((it) => it.body).filter(Boolean));
    }
    return bodies.map((b) => ({
      itemIdExterno: b.id,
      titulo: b.title,
      preco: b.price,
      estoque: b.available_quantity,
      status: this.mapearStatus(b.status),
      url: b.permalink,
      tipoListagem: b.listing_type_id,
      sku: skuDoAnuncio(b),
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

  async listarPedidosRecentes(horas = 24): Promise<PedidoRemoto[]> {
    const sellerId = await this.sellerId();
    if (!sellerId) return [];
    const desde = new Date(Date.now() - horas * 3600 * 1000).toISOString();
    type Res = { results: PedidoMLRaw[]; paging?: { total?: number } };
    // Offset até esgotar paging.total, sem teto fixo de páginas. A janela de
    // datas curta mantém o total pequeno; o webhook orders_v2 cobre o resto.
    const limit = 50;
    let offset = 0;
    const results: PedidoMLRaw[] = [];
    for (;;) {
      const data = await this.req<Res>(
        {
          method: "GET",
          url: `/orders/search`,
          params: { seller: sellerId, "order.date_created.from": desde, sort: "date_asc", limit, offset },
        },
        "listar pedidos",
      );
      const pageResults = data.results ?? [];
      results.push(...pageResults);
      const total = data.paging?.total ?? results.length;
      offset += limit;
      if (pageResults.length === 0 || offset >= total) break;
    }
    return results.map((o) => mapearPedidoRemotoML(o));
  }

  /** GET /orders/{id}: a notificação orders_v2 só traz o recurso; os dados vêm daqui. */
  async buscarPedido(orderId: string): Promise<PedidoMLRaw> {
    return this.req<PedidoMLRaw>({ method: "GET", url: `/orders/${encodeURIComponent(orderId)}` }, "buscar pedido");
  }

  async listarMensagensNaoLidas(): Promise<MensagemRemota[]> {
    const sellerId = await this.sellerId();
    if (!sellerId) return [];
    type Msg = { id: string; from: { user_id: string }; text: string; message_date: { received: string } };
    const data = await this.req<{ messages?: Msg[] }>(
      { method: "GET", url: `/messages/packs/seller/${sellerId}`, params: { tag: "post_sale" } },
      "mensagens",
    );
    return (data?.messages ?? []).map((m) => ({
      conversaIdExterno: m.id,
      remetente: String(m.from.user_id),
      texto: m.text,
      recebidaEm: new Date(m.message_date.received),
    }));
  }

  async atualizarEstoque(itemIdExterno: string, quantidade: number) {
    await this.req({ method: "PUT", url: `/items/${itemIdExterno}`, data: { available_quantity: quantidade } }, "estoque");
  }
  async atualizarPreco(itemIdExterno: string, preco: number) {
    await this.req({ method: "PUT", url: `/items/${itemIdExterno}`, data: { price: preco } }, "preço");
  }

  async enviarMensagem(conversaIdExterno: string, texto: string) {
    await this.req({ method: "POST", url: `/messages`, data: { conversation_id: conversaIdExterno, text: texto } }, "mensagem");
  }

  // Compatibilidades de autopeças: ver ./ml-compatibilidades.ts (mapeamento
  // AplicacaoVeicular → veículos do catálogo do ML e envio com dry-run).

  // Publica um anúncio novo no ML a partir de um produto interno.
  async publicarAnuncio(opts: {
    titulo: string;
    categoryId: string;        // ex.: MLB1183 (Auto peças)
    preco: number;
    quantidade: number;
    condicao: "new" | "used";
    descricao: string;
    fotos: string[];           // URLs públicas
    sku: string;
    listingTypeId?: string;    // "gold_pro" | "gold_special" | "free" ...
    atributos?: Array<{ id: string; value_name: string }>;
  }) {
    const body = {
      title: opts.titulo,
      category_id: opts.categoryId,
      price: opts.preco,
      currency_id: "BRL",
      available_quantity: opts.quantidade,
      buying_mode: "buy_it_now",
      condition: opts.condicao,
      listing_type_id: opts.listingTypeId ?? "gold_special",
      description: { plain_text: opts.descricao },
      pictures: opts.fotos.map((url) => ({ source: url })),
      attributes: [
        { id: "SELLER_SKU", value_name: opts.sku },
        ...(opts.atributos ?? []),
      ],
    };
    return this.req({ method: "POST", url: `/items`, data: body }, "publicar anúncio");
  }

  // Perguntas pré-venda — gatekeeping para fechamento.
  async listarPerguntasPendentes() {
    const sellerId = await this.sellerId();
    type Pergunta = {
      id: number;
      text: string;
      item_id: string;
      from: { id: number; nickname?: string };
      date_created: string;
    };
    const data = await this.req<{ questions?: Pergunta[] }>(
      { method: "GET", url: `/questions/search`, params: { seller_id: sellerId, status: "UNANSWERED" } },
      "perguntas",
    );
    return (data.questions ?? []).map((p) => ({
      id: p.id,
      texto: p.text,
      itemId: p.item_id,
      compradorId: p.from.id,
      compradorNick: p.from.nickname,
      dataCriacao: new Date(p.date_created),
    }));
  }

  async responderPergunta(questionId: number, texto: string) {
    await this.req({ method: "POST", url: `/answers`, data: { question_id: questionId, text: texto } }, "resposta");
  }

  // Mercado Envios — gera etiqueta de envio de um pedido (shipment).
  async gerarEtiquetaEnvio(shipmentId: string) {
    const data = await this.req<ArrayBuffer>(
      {
        method: "GET",
        url: `/shipment_labels`,
        params: { shipment_ids: shipmentId, response_type: "pdf" },
        responseType: "arraybuffer",
      },
      "etiqueta",
    );
    return Buffer.from(data);
  }

  // Buscar categorias do ML para o auto peças (MLB1747 é "Acessórios para Veículos")
  async buscarCategoriasAutoPecas() {
    type Cat = { id: string; name: string };
    const data = await this.req<Cat[]>({ method: "GET", url: `/sites/MLB/categories` }, "categorias");
    return data.filter((c) => c.name.match(/Auto|Peça|Veículo|Motos/i));
  }
}

/** SKU do anúncio: atributo SELLER_SKU ou o campo legado seller_custom_field. */
export function skuDoAnuncio(b: Pick<AnuncioMLRaw, "attributes" | "seller_custom_field">): string | undefined {
  const attr = b.attributes?.find((a) => a.id === "SELLER_SKU");
  return (attr?.value_name ?? b.seller_custom_field ?? undefined) || undefined;
}

export function mapearPedidoRemotoML(o: PedidoMLRaw): PedidoRemoto {
  return {
    pedidoIdExterno: String(o.id),
    status: o.status,
    valorTotal: o.total_amount,
    valorFrete: o.shipping?.cost ?? 0,
    feeMarketplace: (o.order_items ?? []).reduce((a, it) => a + (it.sale_fee ?? 0) * (it.quantity ?? 1), 0),
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
  };
}

type AnuncioMLRaw = {
  id: string;
  seller_custom_field?: string | null;
  attributes?: Array<{ id: string; value_name?: string | null }>;
  title: string;
  price: number;
  available_quantity: number;
  status: string;
  permalink?: string;
  listing_type_id?: string;
};

export type PedidoMLRaw = {
  pack_id?: number | string | null;
  paid_amount?: number;
  payments?: Array<{
    status?: string;
    shipping_cost?: number;
    payment_type?: string;
    payment_type_id?: string;
    payment_method_id?: string;
    installments?: number;
  }>;
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
    item: { id: string; title: string; seller_sku?: string | null; seller_custom_field?: string | null; variation_id?: number | null };
    quantity: number;
    unit_price: number;
    sale_fee?: number;
  }>;
};
