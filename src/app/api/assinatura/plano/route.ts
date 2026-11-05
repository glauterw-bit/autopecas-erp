import { NextResponse } from "next/server";
import { z } from "zod";
import { comAuth } from "@/lib/auth/guard";
import { escolherPlano } from "@/lib/assinatura/servico";

// Escolher ou trocar de plano (só ADMIN). Cria o cliente e a assinatura no Asaas.
const schema = z.object({
  planoCodigo: z.string().min(1).max(40),
  ciclo: z.enum(["MENSAL", "ANUAL"]),
  forma: z.enum(["BOLETO", "PIX", "CREDIT_CARD", "UNDEFINED"]).default("UNDEFINED"),
});

export const POST = comAuth("ADMIN", async (req, _ctx, usuario) => {
  const body = schema.parse(await req.json());
  const r = await escolherPlano({ id: usuario.id, empresaId: usuario.empresaId }, body);
  return NextResponse.json(r);
});
