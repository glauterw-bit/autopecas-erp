import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, respostaErro } from "@/lib/auth/guard";
import { hashSenha } from "@/lib/auth/config";
import { ipDoCliente } from "@/lib/auth/ip";
import { permitidoAsync } from "@/lib/auth/rate-limit";
import { consumirTokenConta } from "@/lib/auth/contas";
import { validarSenhaNova } from "@/lib/auth/token";
import { registrarAuditoria } from "@/lib/auth/auditoria";

// Rota pública: quem tem o link (token de uso único) define a senha.
// Vale para convite e para redefinição. Encerra todas as sessões do usuário.
const schema = z.object({ token: z.string().min(20).max(100), senha: z.string().min(1).max(200) });

export async function POST(req: NextRequest) {
  try {
    const ip = ipDoCliente(req);
    if (!(await permitidoAsync(`redefinir:ip:${ip}`, 20, 15 * 60 * 1000))) {
      return NextResponse.json({ erro: "Muitas tentativas. Aguarde." }, { status: 429 });
    }
    const body = schema.parse(await req.json());
    const problema = validarSenhaNova(body.senha);
    if (problema) throw new ApiError(400, problema);

    const ok = await prisma.$transaction(async (tx) => {
      const t = await consumirTokenConta(tx, body.token, ["REDEFINICAO_SENHA", "CONVITE"]);
      if (!t) return false;
      const u = await tx.usuario.findUnique({
        where: { id: t.usuarioId },
        select: { id: true, empresaId: true, ativo: true },
      });
      if (!u || !u.ativo) return false;
      await tx.usuario.update({ where: { id: u.id }, data: { senhaHash: hashSenha(body.senha) } });
      await tx.sessaoAuth.deleteMany({ where: { usuarioId: u.id } });
      await registrarAuditoria(tx, {
        empresaId: u.empresaId,
        usuarioId: u.id,
        acao: t.tipo === "CONVITE" ? "CONVITE_ACEITO" : "SENHA_REDEFINIDA",
        entidade: "Usuario",
        entidadeId: u.id,
      });
      return true;
    });
    if (!ok) throw new ApiError(400, "Link inválido ou vencido. Peça um novo.");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaErro(e);
  }
}
