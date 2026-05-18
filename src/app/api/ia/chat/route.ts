import { NextRequest, NextResponse } from "next/server";
import { conversarChat } from "@/lib/ai/chat";
import { empresaAtualId } from "@/lib/sessao";

export async function POST(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const { mensagem, historico } = (await req.json()) as {
    mensagem: string;
    historico?: { role: "user" | "assistant"; content: string }[];
  };
  const hist = (historico ?? []).map((h) => ({ role: h.role, content: h.content }));
  const out = await conversarChat({ empresaId, mensagemUsuario: mensagem, historico: hist });
  return NextResponse.json({ resposta: out.resposta });
}
