import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { criarSessao, verificarSenha, verificarTotp } from "@/lib/auth/config";

const schema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
  totp: z.string().regex(/^\d{6}$/).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const u = await prisma.usuario.findUnique({ where: { email: body.email } });
    if (!u || !u.ativo) return NextResponse.json({ erro: "Credenciais inválidas" }, { status: 401 });
    if (!verificarSenha(body.senha, u.senhaHash))
      return NextResponse.json({ erro: "Credenciais inválidas" }, { status: 401 });
    if (u.totpSecret) {
      if (!body.totp || !verificarTotp(u.totpSecret, body.totp)) {
        return NextResponse.json({ erro: "TOTP inválido", precisaTotp: true }, { status: 401 });
      }
    }
    const ip = req.headers.get("x-forwarded-for") ?? "";
    const ua = req.headers.get("user-agent") ?? "";
    await criarSessao(u.id, ip, ua);
    return NextResponse.json({ id: u.id, nome: u.nome, perfil: u.perfil });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 });
  }
}
