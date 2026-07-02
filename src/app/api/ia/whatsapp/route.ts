import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { conversarChat } from "@/lib/ai/chat";
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

  const body = JSON.parse(bruto) as {
    entry?: Array<{ changes?: Array<{ value?: { messages?: Array<{ from: string; text?: { body: string } }> } }> }>;
  };
  const mensagens = body.entry?.[0]?.changes?.[0]?.value?.messages ?? [];
  if (mensagens.length === 0) return NextResponse.json({ ok: true });

  // Uma instalação atende uma empresa por número de WhatsApp; enquanto houver
  // um único número conectado, roteamos para a empresa que tem o canal ativo.
  const empresa = await prisma.empresa.findFirstOrThrow({ select: { id: true } });

  for (const m of mensagens) {
    if (!m.text?.body) continue;
    const cliente = await prisma.cliente.findFirst({
      where: { empresaId: empresa.id, whatsapp: { contains: m.from } },
      select: { id: true },
    });
    const conversa = await prisma.conversaIA.create({
      data: {
        canal: "WHATSAPP",
        clienteId: cliente?.id,
        identificadorExterno: m.from,
      },
    });
    const { resposta } = await conversarChat({
      empresaId: empresa.id,
      conversaId: conversa.id,
      mensagemUsuario: m.text.body,
    });
    await prisma.mensagemIA.createMany({
      data: [
        { conversaId: conversa.id, papel: "USUARIO", conteudo: m.text.body },
        { conversaId: conversa.id, papel: "ASSISTENTE", conteudo: resposta },
      ],
    });

    try {
      await enviarTexto({ para: m.from, texto: resposta });
    } catch (e) {
      console.error("[whatsapp] falha ao responder", m.from, (e as Error).message);
    }
  }
  return NextResponse.json({ ok: true });
}
