import { NextRequest, NextResponse } from "next/server";
import { tokenWebhookValido } from "@/lib/assinatura/asaas";
import { processarEventoAsaas, type EventoAsaas } from "@/lib/assinatura/webhook";

// Webhook do Asaas (cobrança da assinatura do SaaS).
// Autenticado pelo header "asaas-access-token" (o token que cadastramos no
// painel do Asaas = env ASAAS_WEBHOOK_TOKEN), comparado em tempo constante.
// Idempotente por id do evento (EventoWebhook origem ASAAS). Erro interno
// devolve 500 para o Asaas reenviar; evento repetido devolve 200.
export async function POST(req: NextRequest) {
  if (!process.env.ASAAS_WEBHOOK_TOKEN) {
    console.error("[webhook-asaas] ASAAS_WEBHOOK_TOKEN não configurado — rejeitando");
    return NextResponse.json({ erro: "indisponível" }, { status: 503 });
  }
  if (!tokenWebhookValido(req.headers.get("asaas-access-token"))) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "payload inválido" }, { status: 400 });
  }
  if (!corpo || typeof corpo !== "object" || typeof (corpo as EventoAsaas).event !== "string") {
    return NextResponse.json({ erro: "payload inválido" }, { status: 400 });
  }
  try {
    const resultado = await processarEventoAsaas(corpo as EventoAsaas);
    return NextResponse.json({ ok: true, resultado });
  } catch (e) {
    console.error("[webhook-asaas]", (e as Error).message);
    return NextResponse.json({ erro: "falha ao processar" }, { status: 500 });
  }
}
