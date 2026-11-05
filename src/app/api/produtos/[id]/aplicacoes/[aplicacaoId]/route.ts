import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { registrarAuditoria } from "@/lib/crm/auditoria";
import { exigirProduto } from "@/lib/produtos/aplicacoes";

// DELETE (ESTOQUISTA): tira uma aplicação do produto e o selo "aplicação
// verificada" (precisa conferir de novo). Grava LogAuditoria.

type Ctx = { params: Promise<{ id: string; aplicacaoId: string }> };

export const DELETE = comAuth<Ctx>("ESTOQUISTA", async (_req, ctx, usuario) => {
  const { id, aplicacaoId } = await ctx.params;
  const produto = await exigirProduto(id, usuario.empresaId);
  const ap = await prisma.aplicacaoVeicular.findFirst({
    where: { id: aplicacaoId, produtoId: id },
    select: { id: true, versaoId: true, posicao: true, quantidadePorVeiculo: true, observacao: true },
  });
  if (!ap) throw new ApiError(404, "Aplicação não encontrada");

  await prisma.$transaction(async (tx) => {
    await tx.aplicacaoVeicular.delete({ where: { id: aplicacaoId } });
    await tx.produto.update({
      where: { id },
      data: { aplicacaoVerificadaEm: null, aplicacaoVerificadaPorId: null, aplicacaoVerificadaPorNome: null },
    });
    await registrarAuditoria(tx, {
      usuarioId: usuario.id,
      acao: "APLICACAO_REMOVIDA",
      entidade: "Produto",
      entidadeId: id,
      antes: { ...ap, aplicacaoVerificadaEm: produto.aplicacaoVerificadaEm },
      depois: { aplicacaoVerificadaEm: null },
    });
  });
  return NextResponse.json({ ok: true, seloRemovido: Boolean(produto.aplicacaoVerificadaEm) });
});
