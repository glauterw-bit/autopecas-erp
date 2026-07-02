import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { criarSessao, verificarSenha, verificarTotp } from "@/lib/auth/config";
import { permitido } from "@/lib/auth/rate-limit";
import { respostaErro } from "@/lib/auth/guard";

const schema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
  totp: z.string().regex(/^\d{6}$/).optional(),
});

const LIMITE = 5;
const JANELA_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const body = schema.parse(await req.json());

    if (!permitido(`login:${ip}`, LIMITE * 4, JANELA_MS) || !permitido(`login:${ip}:${body.email}`, LIMITE, JANELA_MS)) {
      return NextResponse.json(
        { erro: "Muitas tentativas. Aguarde 15 minutos." },
        { status: 429 },
      );
    }

    const u = await prisma.usuario.findUnique({ where: { email: body.email } });
    if (!u || !u.ativo) return NextResponse.json({ erro: "Credenciais inválidas" }, { status: 401 });
    if (!verificarSenha(body.senha, u.senhaHash))
      return NextResponse.json({ erro: "Credenciais inválidas" }, { status: 401 });
    if (u.totpSecret) {
      if (!body.totp || !verificarTotp(u.totpSecret, body.totp)) {
        return NextResponse.json({ erro: "TOTP inválido", precisaTotp: true }, { status: 401 });
      }
    }
    const ua = req.headers.get("user-agent") ?? "";
    await criarSessao(u.id, ip, ua);
    return NextResponse.json({ id: u.id, nome: u.nome, perfil: u.perfil });
  } catch (e) {
    return respostaErro(e);
  }
}
