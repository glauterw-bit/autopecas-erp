import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";

// Inventário rotativo
// -------------------
// POST: abre um inventário EM_CONTAGEM com snapshot do saldo atual do
//       depósito (um ItemInventario por produto; máx. 500 itens).
//       Filtro opcional por categoria, curva ABC ou lista de produtos.
// GET:  lista os inventários da empresa (mais recentes primeiro).

const MAX_ITENS = 500;

const criarSchema = z.object({
  depositoId: z.string().min(1),
  observacao: z.string().max(500).optional(),
  filtro: z
    .object({
      categoriaId: z.string().min(1).optional(),
      curva: z.enum(["A", "B", "C"]).optional(),
      produtoIds: z.array(z.string().min(1)).min(1).max(MAX_ITENS).optional(),
    })
    .optional(),
});

export const POST = comAuth("ESTOQUISTA", async (req, _ctx, usuario) => {
  const body = criarSchema.parse(await req.json());
  const empresaId = usuario.empresaId;

  const deposito = await prisma.deposito.findFirst({
    where: { id: body.depositoId, empresaId },
    select: { id: true, nome: true },
  });
  if (!deposito) throw new ApiError(404, "Depósito não encontrado");

  const filtro = body.filtro;
  const estoques = await prisma.estoqueDeposito.findMany({
    where: {
      depositoId: deposito.id,
      produto: {
        empresaId,
        ...(filtro?.categoriaId ? { categoriaId: filtro.categoriaId } : {}),
        ...(filtro?.curva ? { curva: filtro.curva } : {}),
        ...(filtro?.produtoIds ? { id: { in: filtro.produtoIds } } : {}),
      },
    },
    select: { produtoId: true, quantidade: true },
    orderBy: { produtoId: "asc" },
    take: MAX_ITENS,
  });
  if (estoques.length === 0) {
    throw new ApiError(400, "Nenhum produto encontrado no depósito com o filtro informado");
  }

  const inventario = await prisma.inventario.create({
    data: {
      empresaId,
      depositoId: deposito.id,
      responsavelId: usuario.id,
      observacao: body.observacao,
      itens: {
        createMany: {
          data: estoques.map((e) => ({
            produtoId: e.produtoId,
            qtdSistema: e.quantidade,
          })),
        },
      },
    },
    include: {
      deposito: { select: { id: true, nome: true } },
      _count: { select: { itens: true } },
    },
  });

  return NextResponse.json(inventario, { status: 201 });
});

export const GET = comAuth("ESTOQUISTA", async (_req, _ctx, usuario) => {
  const inventarios = await prisma.inventario.findMany({
    where: { empresaId: usuario.empresaId },
    include: {
      deposito: { select: { id: true, nome: true } },
      _count: { select: { itens: true } },
    },
    orderBy: { criadoEm: "desc" },
    take: 50,
  });
  return NextResponse.json(inventarios);
});
