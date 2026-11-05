import { NextResponse } from "next/server";
import { z } from "zod";
import { conversarChat } from "@/lib/ai/chat";
import { exigirLimiteIA } from "@/lib/ai/limite";
import { comAuth } from "@/lib/auth/guard";

const corpoSchema = z.object({
  mensagem: z.string().trim().min(1).max(2000),
  // Só papéis de conversa; nada de "system"/"tool" vindo do navegador.
  historico: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(40)
    .optional(),
});

export const POST = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  await exigirLimiteIA("chat", usuario.id);
  const { mensagem, historico } = corpoSchema.parse(await req.json());
  const out = await conversarChat({
    empresaId: usuario.empresaId,
    mensagemUsuario: mensagem,
    historico: (historico ?? []).slice(-20),
  });
  return NextResponse.json({ resposta: out.resposta, precosMascarados: out.precosMascarados });
});
