import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  gerarTotpSecret,
  urlOtpAuth,
  usuarioDaSessao,
  verificarTotp,
} from "@/lib/auth/config";

export async function POST(req: NextRequest) {
  const u = await usuarioDaSessao();
  if (!u) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  const body = (await req.json()) as { acao: "iniciar" | "confirmar" | "desativar"; codigo?: string };
  if (body.acao === "iniciar") {
    const secret = gerarTotpSecret();
    // Não salva ainda — só salva quando o usuário confirmar com o primeiro código
    return NextResponse.json({
      secret,
      url: urlOtpAuth(u.email, secret),
    });
  }
  if (body.acao === "confirmar") {
    const { codigo, secret } = body as unknown as { codigo: string; secret: string };
    if (!verificarTotp(secret, codigo))
      return NextResponse.json({ erro: "Código inválido" }, { status: 400 });
    await prisma.usuario.update({ where: { id: u.id }, data: { totpSecret: secret } });
    return NextResponse.json({ ok: true });
  }
  await prisma.usuario.update({ where: { id: u.id }, data: { totpSecret: null } });
  return NextResponse.json({ ok: true });
}
