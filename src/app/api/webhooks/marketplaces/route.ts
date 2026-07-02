import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Webhook unificado para marketplaces (ML notifications, Shopee push, Magalu).
// Segurança em duas camadas:
// 1) token secreto na URL (?token=WEBHOOK_TOKEN) — obrigatório para todas
//    as plataformas (ML não assina payloads; o token é a única defesa).
// 2) assinatura HMAC quando a plataforma assina (Shopee: Authorization =
//    HMAC-SHA256(partner_key, url|body)).
// O payload é persistido e o processamento vai pra fila — resposta rápida
// evita timeout/reentrega do provedor.

export async function POST(req: NextRequest) {
  const esperado = process.env.WEBHOOK_TOKEN;
  if (!esperado) {
    console.error("[webhook] WEBHOOK_TOKEN não configurado — rejeitando");
    return NextResponse.json({ erro: "não configurado" }, { status: 503 });
  }
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (token.length !== esperado.length ||
      !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(esperado))) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const bruto = await req.text();
  const plataforma = (req.nextUrl.searchParams.get("plataforma") ?? "DESCONHECIDO").toUpperCase();

  // Shopee assina: Authorization = HMAC-SHA256(partner_key, `${url}|${body}`)
  if (plataforma === "SHOPEE" && process.env.SHOPEE_PARTNER_KEY) {
    const assinatura = req.headers.get("authorization") ?? "";
    const url = `${req.nextUrl.origin}${req.nextUrl.pathname}`;
    const calc = crypto
      .createHmac("sha256", process.env.SHOPEE_PARTNER_KEY)
      .update(`${url}|${bruto}`)
      .digest("hex");
    if (assinatura !== calc) {
      return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
    }
  }

  let body: unknown = null;
  try {
    body = bruto ? JSON.parse(bruto) : null;
  } catch {
    return NextResponse.json({ erro: "payload inválido" }, { status: 400 });
  }

  // Persiste o evento bruto pra auditoria/reprocessamento.
  const evento = await prisma.insightIA.create({
    data: {
      // Webhook não identifica tenant — o worker de sync resolve pela conta
      // conectada de cada empresa; o registro fica na primeira empresa ativa
      // apenas como trilha de auditoria.
      empresaId:
        (await prisma.empresa.findFirst({ select: { id: true } }))?.id ?? "",
      tipo: "TENDENCIA_DEMANDA",
      severidade: "INFO",
      titulo: `Webhook ${plataforma}`,
      descricao: bruto.slice(0, 500),
      dadosReferencia: body as object,
    },
  }).catch(() => null);

  // Dispara o sync incremental na fila (não bloqueia a resposta).
  try {
    const { queues } = await import("@/workers/queues");
    await queues.marketplaces.add(
      "webhook",
      { plataforma, eventoId: evento?.id ?? null, payload: body },
      { attempts: 3 },
    );
  } catch (e) {
    console.error("[webhook] fila indisponível, evento persistido:", (e as Error).message);
  }

  return NextResponse.json({ ok: true });
}
