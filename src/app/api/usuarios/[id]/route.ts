import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, comAuth } from "@/lib/auth/guard";
import { deixariaSemAdmin } from "@/lib/auth/token";
import { registrarAuditoria } from "@/lib/auth/auditoria";

// Muda perfil, nome ou situação (ativo) de um usuário da empresa (só ADMIN).
// Nunca deixa a empresa sem nenhum ADMIN ativo (conferido dentro da transação,
// com as linhas dos ADMIN travadas, para duas trocas ao mesmo tempo não furarem a regra).
type Ctx = { params: Promise<{ id: string }> };

const schema = z
  .object({
    perfil: z.enum(["ADMIN", "GERENTE", "FINANCEIRO", "VENDEDOR", "CAIXA", "ESTOQUISTA", "TECNICO"]).optional(),
    ativo: z.boolean().optional(),
    nome: z.string().trim().min(2).max(120).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nada para alterar");

export const PATCH = comAuth<Ctx>("ADMIN", async (req, ctx, usuario) => {
  const { id } = await ctx.params;
  const body = schema.parse(await req.json());
  const empresaId = usuario.empresaId;

  const resultado = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM usuarios WHERE "empresaId" = ${empresaId} AND perfil = 'ADMIN' AND ativo = true FOR UPDATE`;
    const alvo = await tx.usuario.findFirst({
      where: { id, empresaId },
      select: { id: true, nome: true, email: true, perfil: true, ativo: true },
    });
    if (!alvo) throw new ApiError(404, "Usuário não encontrado");

    const novoPerfil = body.perfil ?? alvo.perfil;
    const novoAtivo = body.ativo ?? alvo.ativo;
    const outros = await tx.usuario.count({
      where: { empresaId, perfil: "ADMIN", ativo: true, id: { not: alvo.id } },
    });
    if (
      deixariaSemAdmin({
        adminsAtivosOutros: outros,
        alvoEraAdminAtivo: alvo.perfil === "ADMIN" && alvo.ativo,
        alvoContinuaAdminAtivo: novoPerfil === "ADMIN" && novoAtivo,
      })
    ) {
      throw new ApiError(409, "A empresa precisa ter pelo menos um administrador ativo.");
    }

    const atualizado = await tx.usuario.update({
      where: { id: alvo.id },
      data: { perfil: novoPerfil, ativo: novoAtivo, nome: body.nome ?? alvo.nome },
      select: { id: true, nome: true, email: true, perfil: true, ativo: true },
    });
    // Desativou ou mudou o perfil: derruba as sessões abertas dele.
    if (!novoAtivo || novoPerfil !== alvo.perfil) {
      await tx.sessaoAuth.deleteMany({ where: { usuarioId: alvo.id } });
    }
    await registrarAuditoria(tx, {
      empresaId,
      usuarioId: usuario.id,
      acao: !novoAtivo && alvo.ativo ? "USUARIO_DESATIVADO" : novoAtivo && !alvo.ativo ? "USUARIO_REATIVADO" : "USUARIO_ALTERADO",
      entidade: "Usuario",
      entidadeId: alvo.id,
      antes: { nome: alvo.nome, perfil: alvo.perfil, ativo: alvo.ativo },
      depois: { nome: atualizado.nome, perfil: atualizado.perfil, ativo: atualizado.ativo },
    });
    return atualizado;
  });
  return NextResponse.json(resultado);
});
