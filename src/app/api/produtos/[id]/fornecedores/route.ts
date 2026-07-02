import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";

// Grade de fornecedores do produto
// ================================
// GET    (ESTOQUISTA): lista a grade (fornecedor, preço, prazo, mínimo).
// POST   (GERENTE):    upsert por (produtoId, fornecedorId); preferencial único.
// DELETE (GERENTE):    remove um fornecedor da grade.

type Ctx = { params: Promise<{ id: string }> };

const fornecedorSelect = {
  id: true,
  razaoSocial: true,
  nomeFantasia: true,
  prazoEntregaDias: true,
} as const;

async function produtoDaEmpresa(id: string, empresaId: string) {
  const produto = await prisma.produto.findFirst({
    where: { id, empresaId },
    select: { id: true },
  });
  if (!produto) throw new ApiError(404, "Produto não encontrado");
  return produto;
}

export const GET = comAuth<Ctx>("ESTOQUISTA", async (_req, ctx, usuario) => {
  const { id } = await ctx.params;
  await produtoDaEmpresa(id, usuario.empresaId);

  const grade = await prisma.produtoFornecedor.findMany({
    where: { produtoId: id },
    orderBy: [{ preferencial: "desc" }, { precoCompra: "asc" }],
    include: { fornecedor: { select: fornecedorSelect } },
  });
  return NextResponse.json(grade);
});

const postSchema = z.object({
  fornecedorId: z.string().min(1),
  precoCompra: z.number().nonnegative(),
  prazoEntregaDias: z.number().int().positive().optional(),
  qtdMinima: z.number().positive().optional(),
  codigoNoFornecedor: z.string().max(120).optional(),
  preferencial: z.boolean().optional(),
});

export const POST = comAuth<Ctx>("GERENTE", async (req, ctx, usuario) => {
  const { id } = await ctx.params;
  const body = postSchema.parse(await req.json());
  await produtoDaEmpresa(id, usuario.empresaId);

  const fornecedor = await prisma.fornecedor.findFirst({
    where: { id: body.fornecedorId, empresaId: usuario.empresaId },
    select: { id: true },
  });
  if (!fornecedor) throw new ApiError(404, "Fornecedor não encontrado");

  const item = await prisma.$transaction(async (tx) => {
    // preferencial é único por produto: ao marcar um, desmarca os demais
    if (body.preferencial) {
      await tx.produtoFornecedor.updateMany({
        where: { produtoId: id, fornecedorId: { not: body.fornecedorId } },
        data: { preferencial: false },
      });
    }
    return tx.produtoFornecedor.upsert({
      where: {
        produtoId_fornecedorId: { produtoId: id, fornecedorId: body.fornecedorId },
      },
      create: {
        produtoId: id,
        fornecedorId: body.fornecedorId,
        precoCompra: body.precoCompra,
        ...(body.prazoEntregaDias !== undefined && { prazoEntregaDias: body.prazoEntregaDias }),
        ...(body.qtdMinima !== undefined && { qtdMinima: body.qtdMinima }),
        ...(body.codigoNoFornecedor !== undefined && { codigoNoFornecedor: body.codigoNoFornecedor }),
        preferencial: body.preferencial ?? false,
      },
      update: {
        precoCompra: body.precoCompra,
        ...(body.prazoEntregaDias !== undefined && { prazoEntregaDias: body.prazoEntregaDias }),
        ...(body.qtdMinima !== undefined && { qtdMinima: body.qtdMinima }),
        ...(body.codigoNoFornecedor !== undefined && { codigoNoFornecedor: body.codigoNoFornecedor }),
        ...(body.preferencial !== undefined && { preferencial: body.preferencial }),
      },
      include: { fornecedor: { select: fornecedorSelect } },
    });
  });

  return NextResponse.json(item, { status: 201 });
});

const deleteSchema = z.object({ fornecedorId: z.string().min(1) });

export const DELETE = comAuth<Ctx>("GERENTE", async (req, ctx, usuario) => {
  const { id } = await ctx.params;
  const body = deleteSchema.parse(await req.json());
  await produtoDaEmpresa(id, usuario.empresaId);

  const removidos = await prisma.produtoFornecedor.deleteMany({
    where: { produtoId: id, fornecedorId: body.fornecedorId },
  });
  if (removidos.count === 0) {
    throw new ApiError(404, "Fornecedor não está na grade deste produto");
  }
  return NextResponse.json({ ok: true });
});
