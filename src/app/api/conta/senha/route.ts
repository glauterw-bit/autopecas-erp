import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, comAuth } from "@/lib/auth/guard";
import { hashSenha, verificarSenha } from "@/lib/auth/config";
import { permitidoAsync } from "@/lib/auth/rate-limit";
import { validarSenhaNova } from "@/lib/auth/token";
import { registrarAuditoria } from "@/lib/auth/auditoria";
import { cookies } from "next/headers";

// Troca de senha do próprio usuário: pede a atual.
const schema = z.object({ atual: z.string().min(1), nova: z.string().min(1).max(200) });

export const POST = comAuth(null, async (req, _ctx, sessao) => {
  const body = schema.parse(await req.json());
  if (!(await permitidoAsync(`troca-senha:${sessao.id}`, 5, 15 * 60 * 1000))) {
    throw new ApiError(429, "Muitas tentativas. Aguarde 15 minutos.");
  }
  const u = await prisma.usuario.findFirst({
    where: { id: sessao.id, empresaId: sessao.empresaId },
    select: { id: true, senhaHash: true },
  });
  if (!u || !verificarSenha(body.atual, u.senhaHash)) {
    throw new ApiError(400, "A senha atual não confere.");
  }
  const problema = validarSenhaNova(body.nova);
  if (problema) throw new ApiError(400, problema);
  if (body.nova === body.atual) throw new ApiError(400, "A senha nova precisa ser diferente da atual.");

  const tokenAtual = (await cookies()).get("ap_auth")?.value;
  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: u.id }, data: { senhaHash: hashSenha(body.nova) } });
    // Encerra as outras sessões; mantém só a que está trocando a senha.
    await tx.sessaoAuth.deleteMany({
      where: { usuarioId: u.id, ...(tokenAtual ? { token: { not: tokenAtual } } : {}) },
    });
    await registrarAuditoria(tx, {
      empresaId: sessao.empresaId,
      usuarioId: u.id,
      acao: "SENHA_ALTERADA",
      entidade: "Usuario",
      entidadeId: u.id,
    });
  });
  return NextResponse.json({ ok: true });
});
