import { NextResponse } from "next/server";
import type OpenAI from "openai";
import { conversarChat } from "@/lib/ai/chat";
import { comAuth } from "@/lib/auth/guard";

export const POST = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const { mensagem, historico } = (await req.json()) as {
    mensagem: string;
    historico?: { role: "user" | "assistant"; content: string }[];
  };
  const hist: OpenAI.Chat.ChatCompletionMessageParam[] = (historico ?? []).map((h) => ({
    role: h.role,
    content: h.content,
  }));
  const out = await conversarChat({ empresaId, mensagemUsuario: mensagem, historico: hist });
  return NextResponse.json({ resposta: out.resposta });
});
