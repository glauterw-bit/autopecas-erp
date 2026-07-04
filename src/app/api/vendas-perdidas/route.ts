import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";

// Venda perdida
// =============
// POST (VENDEDOR): registra em 2 cliques no PDV ou manualmente na tela de
// compras. Contrato estável — o PDV depende dele.
// GET  (VENDEDOR): últimas 100 da empresa, com o produto vinculado.

const postSchema = z.object({
  descricaoBuscada: z.string().min(1, "Descreva o que o cliente buscava").max(300),
  produtoId: z.string().optional(),
  quantidade: z.number().positive().max(99999).optional(),
  motivo: z
    .enum(["SEM_ESTOQUE", "PRECO", "PRAZO_ENTREGA", "NAO_TRABALHAMOS", "OUTRO"])
    .optional(),
  clienteId: z.string().optional(),
  observacao: z.string().max(500).optional(),
});

const produtoSelect = { id: true, sku: true, nome: true } as const;

export const POST = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  const body = postSchema.parse(await req.json());

  if (body.produtoId) {
    const produto = await prisma.produto.findFirst({
      where: { id: body.produtoId, empresaId: usuario.empresaId },
      select: { id: true },
    });
    if (!produto) throw new ApiError(404, "Produto não encontrado");
  }
  if (body.clienteId) {
    const cliente = await prisma.cliente.findFirst({
      where: { id: body.clienteId, empresaId: usuario.empresaId },
      select: { id: true },
    });
    if (!cliente) throw new ApiError(404, "Cliente não encontrado");
  }

  const criada = await prisma.vendaPerdida.create({
    data: {
      empresaId: usuario.empresaId,
      vendedorId: usuario.id,
      descricaoBuscada: body.descricaoBuscada,
      produtoId: body.produtoId,
      quantidade: body.quantidade ?? 1,
      motivo: body.motivo ?? "SEM_ESTOQUE",
      clienteId: body.clienteId,
      observacao: body.observacao,
    },
    include: { produto: { select: produtoSelect } },
  });

  return NextResponse.json(criada, { status: 201 });
});

export const GET = comAuth("VENDEDOR", async (_req, _ctx, usuario) => {
  const registros = await prisma.vendaPerdida.findMany({
    where: { empresaId: usuario.empresaId },
    orderBy: { criadoEm: "desc" },
    take: 100,
    include: { produto: { select: produtoSelect } },
  });
  return NextResponse.json(registros);
});
