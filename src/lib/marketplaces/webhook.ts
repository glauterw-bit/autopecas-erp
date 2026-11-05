import crypto from "node:crypto";
import { Prisma, type Plataforma } from "@prisma/client";
import { prisma } from "../db";

// Webhooks de marketplace: assinatura, tenant e idempotência
// ==========================================================
// - Shopee (Open Platform v2, push): header Authorization =
//   HMAC-SHA256(partner_key, `${url_de_callback}|${corpo_bruto}`) em hex.
//   Formato confirmado em SDKs (o doc oficial bloqueia leitura automática):
//   https://packagist.org/packages/minchao/shopee-php. Responder 2xx com corpo vazio.
// - Mercado Livre: não assina. O corpo traz {_id, resource, user_id, topic,
//   application_id, attempts, sent}. Conferimos application_id = ML_APP_ID e
//   SEMPRE buscamos o recurso pela API antes de agir (nunca confiamos no corpo).
//   https://developers.mercadolivre.com.br/produto-receba-notificacoes
// - Tenant: resolvido pela conta conectada (ML user_id / Shopee shop_id →
//   MarketplaceConta.contaExternaId). Sem conta: o evento fica IGNORADO com o
//   motivo — nunca cai numa empresa qualquer.
// - Idempotência: EventoWebhook unique (origem, idExterno).

/** Compara assinaturas hex em tempo constante. */
export function assinaturaHexConfere(recebida: string, calculada: string): boolean {
  const a = Buffer.from(recebida.trim().toLowerCase(), "utf8");
  const b = Buffer.from(calculada.toLowerCase(), "utf8");
  if (a.length !== b.length) {
    // Mantém o custo constante mesmo com tamanho errado.
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function assinarShopee(partnerKey: string, url: string, corpo: string): string {
  return crypto.createHmac("sha256", partnerKey).update(`${url}|${corpo}`).digest("hex");
}

/**
 * A URL de callback assinada é a cadastrada no painel da Shopee. Atrás de proxy
 * o Next pode ver http/host interno, então testamos as variantes plausíveis
 * (APP_URL e a origem vista; com e sem query string).
 */
export function verificarAssinaturaShopee(opts: {
  partnerKey: string;
  assinatura: string | null;
  corpo: string;
  urlsCandidatas: string[];
}): boolean {
  if (!opts.assinatura) return false;
  let ok = false;
  for (const url of new Set(opts.urlsCandidatas)) {
    // Sem curto-circuito: todas as comparações rodam.
    if (assinaturaHexConfere(opts.assinatura, assinarShopee(opts.partnerKey, url, opts.corpo))) ok = true;
  }
  return ok;
}

export interface EventoNormalizado {
  origem: Plataforma | "DESCONHECIDO";
  idExterno: string;
  contaExternaId: string | null;
  topico: string | null;
  recurso: string | null;
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Extrai id do evento, conta e tópico do corpo de cada plataforma (pura). */
export function normalizarEvento(plataforma: string, corpo: string, payload: unknown): EventoNormalizado {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (plataforma === "MERCADO_LIVRE") {
    const id =
      typeof p._id === "string" && p._id
        ? p._id
        : sha(`${p.topic}|${p.resource}|${p.user_id}|${p.sent ?? ""}`);
    return {
      origem: "MERCADO_LIVRE",
      idExterno: id,
      contaExternaId: p.user_id != null ? String(p.user_id) : null,
      topico: typeof p.topic === "string" ? p.topic : null,
      recurso: typeof p.resource === "string" ? p.resource : null,
    };
  }
  if (plataforma === "SHOPEE") {
    return {
      origem: "SHOPEE",
      idExterno: sha(corpo),
      contaExternaId: p.shop_id != null ? String(p.shop_id) : null,
      topico: p.code != null ? String(p.code) : null,
      recurso: null,
    };
  }
  if (plataforma === "MAGALU") {
    return {
      origem: "MAGALU",
      idExterno: typeof p.id === "string" ? p.id : sha(corpo),
      contaExternaId: (p.seller_id ?? p.tenant_id ?? null) as string | null,
      topico: (p.topic ?? p.type ?? null) as string | null,
      recurso: (p.resource ?? null) as string | null,
    };
  }
  return { origem: "DESCONHECIDO", idExterno: sha(corpo), contaExternaId: null, topico: null, recurso: null };
}

export type RegistroEvento =
  | { novo: true; eventoId: string; contaId: string | null; empresaId: string | null }
  | { novo: false; eventoId: string };

/**
 * Grava o evento uma única vez. A empresa vem da conta conectada; se nenhuma
 * conta casar, grava como IGNORADO com o motivo (sem empresa).
 */
export async function registrarEvento(ev: EventoNormalizado, payload: unknown): Promise<RegistroEvento> {
  const ja = await prisma.eventoWebhook.findUnique({
    where: { origem_idExterno: { origem: ev.origem, idExterno: ev.idExterno } },
    select: { id: true },
  });
  if (ja) return { novo: false, eventoId: ja.id };

  const conta =
    ev.origem !== "DESCONHECIDO" && ev.contaExternaId
      ? await prisma.marketplaceConta.findFirst({
          where: { plataforma: ev.origem, contaExternaId: ev.contaExternaId, ativa: true },
          select: { id: true, empresaId: true },
        })
      : null;

  try {
    const criado = await prisma.eventoWebhook.create({
      data: {
        origem: ev.origem,
        idExterno: ev.idExterno,
        empresaId: conta?.empresaId ?? null,
        contaId: conta?.id ?? null,
        topico: ev.topico,
        recurso: ev.recurso,
        status: conta ? "PENDENTE" : "IGNORADO",
        erro: conta ? null : "nenhuma conta conectada casa com o remetente",
        payload: (payload ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return { novo: true, eventoId: criado.id, contaId: conta?.id ?? null, empresaId: conta?.empresaId ?? null };
  } catch (e) {
    // Reentrega concorrente do mesmo evento.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existente = await prisma.eventoWebhook.findUniqueOrThrow({
        where: { origem_idExterno: { origem: ev.origem, idExterno: ev.idExterno } },
        select: { id: true },
      });
      return { novo: false, eventoId: existente.id };
    }
    throw e;
  }
}
