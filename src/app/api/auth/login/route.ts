import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { criarSessao, verificarSenha, verificarTotp } from "@/lib/auth/config";
import { ipDoCliente } from "@/lib/auth/ip";
import { permitidoAsync } from "@/lib/auth/rate-limit";
import { respostaErro } from "@/lib/auth/guard";

const schema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
  totp: z.string().regex(/^\d{6}$/).optional(),
});

// Limites em 15 minutos: por usuário (e-mail) e por IP. Contam toda tentativa,
// inclusive a de código 2FA. Usa Redis quando houver REDIS_URL.
const LIMITE_POR_USUARIO = 8;
const LIMITE_POR_IP = 30;
const JANELA_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const ip = ipDoCliente(req);
    const body = schema.parse(await req.json());
    const email = body.email.trim().toLowerCase();

    const [okUsuario, okIp] = await Promise.all([
      permitidoAsync(`login:usuario:${email}`, LIMITE_POR_USUARIO, JANELA_MS),
      permitidoAsync(`login:ip:${ip}`, LIMITE_POR_IP, JANELA_MS),
    ]);
    if (!okUsuario || !okIp) {
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
