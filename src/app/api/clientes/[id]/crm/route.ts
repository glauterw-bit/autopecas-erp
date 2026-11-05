import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { podePerfil } from "@/lib/auth/config";
import { registrarAuditoria } from "@/lib/crm/auditoria";

// Ações de CRM na ficha do cliente
// ================================
// POST { acao: "contato", nota? }                (VENDEDOR) registra que a loja ligou/falou.
// POST { acao: "responsavel", vendedorId|null }  (GERENTE) define a carteira.
// POST { acao: "condicoes", prazoPagamentoDias?, limiteCredito? } (FINANCEIRO)
//      prazo combinado e limite de crédito.
// Tudo grava LogAuditoria com antes e depois. Nenhuma mensagem é enviada
// ao cliente daqui (sem opt-in não há disparo automático).

type Ctx = { params: Promise<{ id: string }> };

const schema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("contato"), nota: z.string().trim().max(300).optional() }),
  z.object({ acao: z.literal("responsavel"), vendedorId: z.string().nullable() }),
  z.object({
    acao: z.literal("condicoes"),
    prazoPagamentoDias: z.number().int().min(0).max(180).nullable().optional(),
    limiteCredito: z.number().nonnegative().max(10_000_000).optional(),
  }),
]);

export const POST = comAuth<Ctx>("VENDEDOR", async (req, ctx, usuario) => {
  const { id } = await ctx.params;
  const body = schema.parse(await req.json());
  const c = await prisma.cliente.findFirst({
    where: { id, empresaId: usuario.empresaId },
    select: {
      id: true,
      vendedorResponsavelId: true,
      prazoPagamentoDias: true,
      limiteCredito: true,
      ultimoContatoEm: true,
      ultimoContatoNota: true,
    },
  });
  if (!c) throw new ApiError(404, "Cliente não encontrado");

  if (body.acao === "contato") {
    const agora = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.cliente.update({
        where: { id },
        data: { ultimoContatoEm: agora, ultimoContatoNota: body.nota || null },
      });
      await registrarAuditoria(tx, {
        usuarioId: usuario.id,
        acao: "CRM_CONTATO",
        entidade: "Cliente",
        entidadeId: id,
        antes: { ultimoContatoEm: c.ultimoContatoEm, ultimoContatoNota: c.ultimoContatoNota },
        depois: { ultimoContatoEm: agora, ultimoContatoNota: body.nota || null },
      });
    });
    return NextResponse.json({ ok: true, ultimoContatoEm: agora });
  }

  if (body.acao === "responsavel") {
    if (!podePerfil(usuario.perfil, "GERENTE")) throw new ApiError(403, "Só gerência define a carteira.");
    if (body.vendedorId) {
      const v = await prisma.usuario.findFirst({
        where: { id: body.vendedorId, empresaId: usuario.empresaId, ativo: true },
        select: { id: true },
      });
      if (!v) throw new ApiError(404, "Usuário não encontrado");
    }
    await prisma.$transaction(async (tx) => {
      await tx.cliente.update({ where: { id }, data: { vendedorResponsavelId: body.vendedorId } });
      await registrarAuditoria(tx, {
        usuarioId: usuario.id,
        acao: "CRM_RESPONSAVEL",
        entidade: "Cliente",
        entidadeId: id,
        antes: { vendedorResponsavelId: c.vendedorResponsavelId },
        depois: { vendedorResponsavelId: body.vendedorId },
      });
    });
    return NextResponse.json({ ok: true });
  }

  // condições comerciais: prazo e limite → FINANCEIRO ou acima
  if (!podePerfil(usuario.perfil, "FINANCEIRO")) {
    throw new ApiError(403, "Prazo e limite de crédito só com perfil financeiro ou gerência.");
  }
  const data: { prazoPagamentoDias?: number | null; limiteCredito?: number } = {};
  if (body.prazoPagamentoDias !== undefined) data.prazoPagamentoDias = body.prazoPagamentoDias;
  if (body.limiteCredito !== undefined) data.limiteCredito = Math.round(body.limiteCredito * 100) / 100;
  if (Object.keys(data).length === 0) throw new ApiError(400, "Nada para alterar.");
  await prisma.$transaction(async (tx) => {
    await tx.cliente.update({ where: { id }, data });
    await registrarAuditoria(tx, {
      usuarioId: usuario.id,
      acao: "CRM_CONDICOES",
      entidade: "Cliente",
      entidadeId: id,
      antes: { prazoPagamentoDias: c.prazoPagamentoDias, limiteCredito: Number(c.limiteCredito) },
      depois: data,
    });
  });
  return NextResponse.json({ ok: true });
});
