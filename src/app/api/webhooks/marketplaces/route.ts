import { NextRequest, NextResponse } from "next/server";
import { iguaisTempoConstante } from "@/lib/pagamentos/webhook-pix-auth";
import {
  normalizarEvento,
  registrarEvento,
  verificarAssinaturaShopee,
} from "@/lib/marketplaces/webhook";

// Webhook unificado para marketplaces (ML notifications, Shopee push, Magalu).
// Segurança:
// 1) token secreto na URL (?token=WEBHOOK_TOKEN), comparado em tempo
//    constante — obrigatório (o ML não assina; o token é a primeira defesa).
// 2) Shopee: HMAC-SHA256 do corpo com a partner_key, em tempo constante.
// 3) ML: application_id tem de ser o nosso app; o recurso é buscado na API
//    pelo worker antes de qualquer ação (o corpo nunca é fonte de verdade).
// Tenant: pela conta conectada (src/lib/marketplaces/webhook.ts). Sem conta,
// o evento fica IGNORADO com o motivo; nunca cai em outra empresa.
// Idempotência: EventoWebhook (origem, idExterno). Resposta rápida e fila.

const PLATAFORMAS = new Set(["MERCADO_LIVRE", "SHOPEE", "MAGALU"]);
const vazio = () => new NextResponse(null, { status: 200 });

export async function POST(req: NextRequest) {
  const esperado = process.env.WEBHOOK_TOKEN;
  if (!esperado) {
    console.error("[webhook] WEBHOOK_TOKEN não configurado — rejeitando");
    return NextResponse.json({ erro: "não configurado" }, { status: 503 });
  }
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!iguaisTempoConstante(token, esperado)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const plataforma = (req.nextUrl.searchParams.get("plataforma") ?? "").toUpperCase();
  if (!PLATAFORMAS.has(plataforma)) {
    return NextResponse.json({ erro: "plataforma inválida" }, { status: 400 });
  }

  const bruto = await req.text();
  if (bruto.length > 256 * 1024) {
    return NextResponse.json({ erro: "payload grande demais" }, { status: 413 });
  }

  if (plataforma === "SHOPEE") {
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    if (!partnerKey) {
      console.error("[webhook] SHOPEE_PARTNER_KEY ausente — push da Shopee rejeitado");
      return NextResponse.json({ erro: "não configurado" }, { status: 503 });
    }
    const caminho = req.nextUrl.pathname;
    const busca = req.nextUrl.search;
    const bases = [req.nextUrl.origin, process.env.APP_URL?.replace(/\/+$/, "")].filter(
      (b): b is string => !!b,
    );
    const ok = verificarAssinaturaShopee({
      partnerKey,
      assinatura: req.headers.get("authorization"),
      corpo: bruto,
      urlsCandidatas: bases.flatMap((b) => [`${b}${caminho}${busca}`, `${b}${caminho}`]),
    });
    if (!ok) return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = bruto ? JSON.parse(bruto) : null;
  } catch {
    return NextResponse.json({ erro: "payload inválido" }, { status: 400 });
  }

  if (plataforma === "MERCADO_LIVRE" && process.env.ML_APP_ID) {
    const appId = String((body as { application_id?: unknown } | null)?.application_id ?? "");
    if (appId !== process.env.ML_APP_ID) {
      return NextResponse.json({ erro: "aplicação não reconhecida" }, { status: 401 });
    }
  }

  try {
    const ev = normalizarEvento(plataforma, bruto, body);
    const reg = await registrarEvento(ev, body);
    if (reg.novo && reg.contaId && process.env.REDIS_URL) {
      try {
        const { queues } = await import("@/workers/queues");
        await queues.marketplaces.add(
          "webhook",
          { eventoId: reg.eventoId },
          { jobId: `evt-${reg.eventoId}`, attempts: 5 },
        );
      } catch (e) {
        // Evento já está gravado como PENDENTE; o sync de 15 min o processa.
        console.error("[webhook] fila indisponível, evento pendente:", (e as Error).message?.slice(0, 120));
      }
    }
  } catch (e) {
    // Sem stack para fora. 500 faz o provedor reentregar (idempotente).
    console.error("[webhook] falha ao registrar evento:", (e as Error).message?.slice(0, 200));
    return NextResponse.json({ erro: "falha temporária" }, { status: 500 });
  }

  // Shopee pede 2xx com corpo vazio; os demais aceitam o mesmo.
  return plataforma === "SHOPEE" ? vazio() : NextResponse.json({ ok: true });
}
