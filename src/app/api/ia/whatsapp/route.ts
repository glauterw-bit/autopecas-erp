import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { conversarChat } from "@/lib/ai/chat";

// Webhook do WhatsApp Business Cloud API.
// Recebe mensagens dos clientes, roteia pelo CopilotoBalcão (com tool-use no
// catálogo da empresa) e devolve a resposta — registrando tudo em ConversaIA.

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

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    entry?: Array<{ changes?: Array<{ value?: { messages?: Array<{ from: string; text?: { body: string } }> } }> }>;
  };
  const mensagens = body.entry?.[0]?.changes?.[0]?.value?.messages ?? [];
  if (mensagens.length === 0) return NextResponse.json({ ok: true });

  const empresa = await prisma.empresa.findFirstOrThrow({ select: { id: true } });

  for (const m of mensagens) {
    if (!m.text?.body) continue;
    // Localiza cliente pelo whatsapp.
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

    // Envia resposta para o WhatsApp (placeholder — em produção chama Graph API)
    // POST https://graph.facebook.com/v20.0/{phone_id}/messages
  }
  return NextResponse.json({ ok: true });
}
