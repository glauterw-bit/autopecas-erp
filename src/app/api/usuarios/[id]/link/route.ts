import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, comAuth } from "@/lib/auth/guard";
import { criarTokenConta, urlDoLink } from "@/lib/auth/contas";
import { SENHA_PENDENTE } from "@/lib/auth/token";
import { registrarAuditoria } from "@/lib/auth/auditoria";

// ADMIN gera o link de redefinição de senha (ou novo convite, se a pessoa ainda
// não definiu senha). Uso único; 30 min para redefinição e 72 h para convite.
// O link aparece só nesta resposta; no banco fica apenas o hash.
type Ctx = { params: Promise<{ id: string }> };

export const POST = comAuth<Ctx>("ADMIN", async (req, ctx, usuario) => {
  const { id } = await ctx.params;
  const alvo = await prisma.usuario.findFirst({
    where: { id, empresaId: usuario.empresaId },
    select: { id: true, ativo: true, senhaHash: true },
  });
  if (!alvo) throw new ApiError(404, "Usuário não encontrado");
  if (!alvo.ativo) throw new ApiError(409, "Usuário desativado. Reative antes de gerar o link.");

  const tipo = alvo.senhaHash === SENHA_PENDENTE ? "CONVITE" : "REDEFINICAO_SENHA";
  const { token, expiraEm } = await prisma.$transaction(async (tx) => {
    const t = await criarTokenConta(tx, { usuarioId: alvo.id, tipo, criadoPorId: usuario.id });
    await registrarAuditoria(tx, {
      empresaId: usuario.empresaId,
      usuarioId: usuario.id,
      acao: "LINK_SENHA_GERADO",
      entidade: "Usuario",
      entidadeId: alvo.id,
      depois: { tipo },
    });
    return t;
  });
  return NextResponse.json({
    link: urlDoLink("/redefinir-senha", token, new URL(req.url).origin),
    tipo,
    expiraEm,
  });
});
