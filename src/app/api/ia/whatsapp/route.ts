import crypto from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { empresaDoNumeroWhatsapp, mascarar } from "@/lib/ai/whatsapp-empresa";
import { iguaisTempoConstante } from "@/lib/pagamentos/webhook-pix-auth";
import { processarMensagemWhatsapp, registrarMensagemWhatsapp } from "@/lib/marketplaces/whatsapp-inbound";

// Webhook do WhatsApp Business Cloud API.
// Inbound verificado com X-Hub-Signature-256 (HMAC do corpo com o App Secret
// da Meta) — sem isso qualquer um forjaria conversas. A resposta da IA é
// enviada de volta via Graph API e tudo fica registrado em ConversaIA.
// A rota só valida, grava cada message.id (idempotente, EventoWebhook origem
// WHATSAPP) e responde 200; a IA roda depois (fila BullMQ com REDIS_URL, ou
// logo após a resposta sem ela). Assim a reentrega da Meta não duplica a
// resposta nem o custo da IA.

export async function GET(req: NextRequest) {
  // Validação inicial do webhook (Meta envia challenge no primeiro registro)
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && esperado && token && iguaisTempoConstante(token, esperado)) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ erro: "verificação falhou" }, { status: 403 });
}

function assinaturaValida(bruto: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    console.error("[whatsapp] META_APP_SECRET não configurado — rejeitando inbound");
    return false;
  }
  if (!header?.startsWith("sha256=")) return false;
  const calc = crypto.createHmac("sha256", secret).update(bruto, "utf8").digest("hex");
  const recebida = header.slice("sha256=".length);
  if (recebida.length !== calc.length) return false;
  return crypto.timingSafeEqual(Buffer.from(recebida, "hex"), Buffer.from(calc, "hex"));
}

export async function POST(req: NextRequest) {
  const bruto = await req.text();
  if (!assinaturaValida(bruto, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  }

  let body: {
    entry?: Array<{
      changes?: Array<{
        value?: {
          metadata?: { phone_number_id?: string };
          messages?: Array<{ id?: string; from: string; text?: { body: string } }>;
        };
      }>;
    }>;
  };
  try {
    body = JSON.parse(bruto);
  } catch {
    return NextResponse.json({ ok: true });
  }
  const valor = body.entry?.[0]?.changes?.[0]?.value;
  const mensagens = valor?.messages ?? [];
  if (mensagens.length === 0) return NextResponse.json({ ok: true });

  // A empresa vem do número que recebeu a mensagem (phone_number_id da Meta), nunca
  // "a primeira do banco". Sem vínculo: 200 para a Meta não reenviar, sem processar.
  const phoneNumberId = valor?.metadata?.phone_number_id;
  const empresaId = await empresaDoNumeroWhatsapp(phoneNumberId);
  if (!empresaId || !phoneNumberId) {
    console.warn("[whatsapp] número sem empresa vinculada; mensagem ignorada", {
      phoneNumberId: mascarar(phoneNumberId),
      quantidade: mensagens.length,
    });
    return NextResponse.json({ ok: true, ignorado: "numero-sem-empresa" });
  }
  const conta = await prisma.marketplaceConta.findFirst({
    where: { empresaId, plataforma: "WHATSAPP_CATALOG", contaExternaId: phoneNumberId, ativa: true },
    select: { id: true },
  });

  const novos: string[] = [];
  for (const m of mensagens) {
    if (!m.id || !m.text?.body) continue;
    const reg = await registrarMensagemWhatsapp({
      empresaId,
      contaId: conta?.id ?? null,
      phoneNumberId,
      messageId: m.id,
      de: m.from,
      texto: m.text.body.slice(0, 2000),
    });
    if (reg.novo) novos.push(reg.eventoId);
  }
  for (const id of novos) await agendar(id);
  return NextResponse.json({ ok: true });
}

/** Fila quando há Redis; senão, depois de responder à Meta (não bloqueia a resposta). */
async function agendar(eventoId: string) {
  if (process.env.REDIS_URL) {
    try {
      const { queues } = await import("@/workers/queues");
      await queues.marketplaces.add("webhook", { eventoId }, { jobId: `evt-${eventoId}`, attempts: 3 });
      return;
    } catch (e) {
      console.error("[whatsapp] fila indisponível, processando sem fila:", (e as Error).message?.slice(0, 120));
    }
  }
  const rodar = async () => {
    try {
      await processarMensagemWhatsapp(eventoId);
    } catch (e) {
      console.error("[whatsapp] falha ao processar mensagem:", (e as Error).message?.slice(0, 160));
    }
  };
  try {
    after(rodar);
  } catch {
    void rodar();
  }
}
