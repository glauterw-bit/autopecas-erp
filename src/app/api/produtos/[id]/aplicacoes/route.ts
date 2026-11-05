import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { registrarAuditoria } from "@/lib/crm/auditoria";
import { exigirProduto, resumoAplicacao } from "@/lib/produtos/aplicacoes";

// Aplicação veicular do produto
// =============================
// GET  (ESTOQUISTA): aplicações do produto.
// POST (ESTOQUISTA): liga o produto a uma versão de veículo (+ posição).
// Mudar a aplicação TIRA o selo "aplicação verificada" (alguém precisa
// conferir de novo). Grava LogAuditoria com antes e depois.
// Montadora, modelo e versão são catálogo compartilhado: aqui só se escolhe.

type Ctx = { params: Promise<{ id: string }> };

const POSICOES = [
  "DIANTEIRA",
  "TRASEIRA",
  "LADO_DIREITO",
  "LADO_ESQUERDO",
  "SUPERIOR",
  "INFERIOR",
  "CENTRAL",
  "DIANTEIRA_DIREITA",
  "DIANTEIRA_ESQUERDA",
  "TRASEIRA_DIREITA",
  "TRASEIRA_ESQUERDA",
] as const;

const postSchema = z.object({
  versaoId: z.string().min(1, "Escolha a versão do veículo."),
  posicao: z.preprocess((v) => (v === "" ? null : v), z.enum(POSICOES).nullable()).optional(),
  quantidadePorVeiculo: z.number().int().min(1).max(99).default(1),
  observacao: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(200).nullable(),
  ).optional(),
});

export const GET = comAuth<Ctx>("ESTOQUISTA", async (_req, ctx, usuario) => {
  const { id } = await ctx.params;
  await exigirProduto(id, usuario.empresaId);
  const aplicacoes = await prisma.aplicacaoVeicular.findMany({
    where: { produtoId: id },
    select: resumoAplicacao,
    orderBy: { id: "asc" },
  });
  return NextResponse.json(aplicacoes);
});

export const POST = comAuth<Ctx>("ESTOQUISTA", async (req, ctx, usuario) => {
  const { id } = await ctx.params;
  const body = postSchema.parse(await req.json());
  const produto = await exigirProduto(id, usuario.empresaId);

  const versao = await prisma.versaoVeiculo.findUnique({ where: { id: body.versaoId }, select: { id: true } });
  if (!versao) throw new ApiError(404, "Versão de veículo não encontrada");

  try {
    const criada = await prisma.$transaction(async (tx) => {
      const nova = await tx.aplicacaoVeicular.create({
        data: {
          produtoId: id,
          versaoId: body.versaoId,
          posicao: body.posicao ?? null,
          quantidadePorVeiculo: body.quantidadePorVeiculo,
          observacao: body.observacao ?? null,
        },
        select: resumoAplicacao,
      });
      // Aplicação mudou: o selo deixa de valer.
      await tx.produto.update({
        where: { id },
        data: { aplicacaoVerificadaEm: null, aplicacaoVerificadaPorId: null, aplicacaoVerificadaPorNome: null },
      });
      await registrarAuditoria(tx, {
        usuarioId: usuario.id,
        acao: "APLICACAO_ADICIONADA",
        entidade: "Produto",
        entidadeId: id,
        antes: { aplicacaoVerificadaEm: produto.aplicacaoVerificadaEm },
        depois: {
          aplicacaoId: nova.id,
          versaoId: body.versaoId,
          posicao: body.posicao ?? null,
          aplicacaoVerificadaEm: null,
        },
      });
      return nova;
    });
    return NextResponse.json({ ...criada, seloRemovido: Boolean(produto.aplicacaoVerificadaEm) }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ApiError(409, "Este produto já tem essa aplicação (mesma versão e posição).");
    }
    throw e;
  }
});
