import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { conversarChat } from "@/lib/ai/chat";
import { ErroIA } from "@/lib/ai/uso";
import { empresaDoNumeroWhatsapp, mascarar } from "@/lib/ai/whatsapp-empresa";
import { permitido } from "@/lib/auth/rate-limit";
import { LIMITES_IA } from "@/lib/ai/limite";
import { enviarTexto } from "@/lib/marketplaces/whatsapp";

// Webhook do WhatsApp Business Cloud API.
// Inbound verificado com X-Hub-Signature-256 (HMAC do corpo com o App Secret
// da Meta) — sem isso qualquer um forjaria conversas. A resposta da IA é
// enviada de volta via Graph API e tudo fica registrado em ConversaIA.

export async function GET(req: NextRequest) {
  // Validação inicial do webhook (Meta envia challenge no primeiro registro)
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
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
          messages?: Array<{ from: string; text?: { body: string } }>;
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
  if (!empresaId) {
    console.warn("[whatsapp] número sem empresa vinculada; mensagem ignorada", {
      phoneNumberId: mascarar(phoneNumberId),
      quantidade: mensagens.length,
    });
    return NextResponse.json({ ok: true, ignorado: "numero-sem-empresa" });
  }

  for (const m of mensagens) {
    if (!m.text?.body) continue;
    const texto = m.text.body.slice(0, 2000);
    const { limite, janelaMs } = LIMITES_IA.whatsapp;
    if (!(await permitido(`ia:whatsapp:${empresaId}:${m.from}`, limite, janelaMs))) {
      console.warn("[whatsapp] limite de mensagens por contato atingido", { de: mascarar(m.from) });
      continue;
    }
    const cliente = await prisma.cliente.findFirst({
      where: { empresaId, whatsapp: { contains: m.from } },
      select: { id: true },
    });
    const conversa = await prisma.conversaIA.create({
      data: {
        canal: "WHATSAPP",
        clienteId: cliente?.id,
        identificadorExterno: m.from,
      },
    });
    let resposta: string;
    try {
      ({ resposta } = await conversarChat({
        empresaId,
        conversaId: conversa.id,
        mensagemUsuario: texto,
        contexto: { canal: "WHATSAPP", clienteIdDoCanal: cliente?.id ?? null },
      }));
    } catch (e) {
      // Teto de custo, IA desligada ou falha da OpenAI: não responde sozinho; fica para atendimento humano.
      console.warn("[whatsapp] IA não respondeu", {
        de: mascarar(m.from),
        motivo: e instanceof ErroIA ? e.message : "erro na IA",
      });
      await prisma.mensagemIA.create({
        data: { conversaId: conversa.id, papel: "USUARIO", conteudo: texto },
      });
      await prisma.conversaIA.update({
        where: { id: conversa.id },
        data: { transferidaParaHumano: true },
      });
      continue;
    }
    await prisma.mensagemIA.createMany({
      data: [
        { conversaId: conversa.id, papel: "USUARIO", conteudo: texto },
        { conversaId: conversa.id, papel: "ASSISTENTE", conteudo: resposta },
      ],
    });

    try {
      await enviarTexto({ para: m.from, texto: resposta });
    } catch (e) {
      console.error("[whatsapp] falha ao responder", mascarar(m.from), (e as Error).message);
    }
  }
  return NextResponse.json({ ok: true });
}
