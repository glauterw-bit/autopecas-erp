import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { respostaErro } from "@/lib/auth/guard";
import { permitidoAsync } from "@/lib/auth/rate-limit";
import { criarTokenConta, urlDoLink } from "@/lib/auth/contas";
import { emailConfigurado, enviarEmail } from "@/lib/auth/email";

// Rota pública (recuperação de senha): a resposta é a mesma para e-mail
// cadastrado ou não, e com ou sem serviço de e-mail configurado.
const schema = z.object({ email: z.string().email().max(200) });
const JANELA_MS = 60 * 60 * 1000;

const RESPOSTA = {
  ok: true,
  mensagem:
    "Se o e-mail estiver cadastrado, enviamos um link para criar uma nova senha. O link vale por 30 minutos. Se não chegar, peça ao administrador da loja.",
};

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const email = schema.parse(await req.json()).email.trim().toLowerCase();

    const [okEmail, okIp] = await Promise.all([
      permitidoAsync(`esqueci:email:${email}`, 3, JANELA_MS),
      permitidoAsync(`esqueci:ip:${ip}`, 10, JANELA_MS),
    ]);
    if (!okEmail || !okIp) {
      return NextResponse.json({ erro: "Muitos pedidos. Tente de novo mais tarde." }, { status: 429 });
    }

    if (emailConfigurado()) {
      const u = await prisma.usuario.findFirst({
        where: { email: { equals: email, mode: "insensitive" }, ativo: true },
        select: { id: true, nome: true, email: true },
      });
      if (u) {
        const { token } = await criarTokenConta(prisma, {
          usuarioId: u.id,
          tipo: "REDEFINICAO_SENHA",
        });
        const link = urlDoLink("/redefinir-senha", token, new URL(req.url).origin);
        await enviarEmail(
          u.email,
          "Nova senha - AutoPeças ERP",
          `Olá, ${u.nome}.\n\nPara criar uma nova senha, abra o link abaixo. Ele vale por 30 minutos e só pode ser usado uma vez.\n\n${link}\n\nSe não foi você, ignore esta mensagem.`,
        );
      }
    }
    return NextResponse.json(RESPOSTA);
  } catch (e) {
    return respostaErro(e);
  }
}
