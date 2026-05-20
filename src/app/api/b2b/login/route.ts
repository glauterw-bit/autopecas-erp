import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loginB2B } from "@/lib/b2b/sessao";

const schema = z.object({
  cpfCnpj: z.string().min(11),
  senha: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const cliente = await loginB2B(body.cpfCnpj, body.senha);
    if (!cliente) return NextResponse.json({ erro: "Credenciais inválidas" }, { status: 401 });
    return NextResponse.json({ id: cliente.id, nome: cliente.nome });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 });
  }
}
