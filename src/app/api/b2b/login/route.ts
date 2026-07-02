import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loginB2B } from "@/lib/b2b/sessao";
import { permitido } from "@/lib/auth/rate-limit";
import { respostaErro } from "@/lib/auth/guard";

const schema = z.object({
  cpfCnpj: z.string().min(11),
  senha: z.string().min(4),
});

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!permitido(`b2b-login:${ip}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ erro: "Muitas tentativas. Aguarde 15 minutos." }, { status: 429 });
    }
    const body = schema.parse(await req.json());
    const cliente = await loginB2B(body.cpfCnpj, body.senha);
    if (!cliente) return NextResponse.json({ erro: "Credenciais inválidas" }, { status: 401 });
    return NextResponse.json({ id: cliente.id, nome: cliente.nome });
  } catch (e) {
    return respostaErro(e);
  }
}
