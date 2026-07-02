import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";

// Transferência entre depósitos/lojas
// -----------------------------------
// POST: move saldo do depósito de origem para o destino, em transação,
//       gerando o par de movimentos TRANSFERENCIA_SAIDA / TRANSFERENCIA_ENTRADA.
// GET:  últimas 50 movimentações de transferência da empresa.

const transferenciaSchema = z.object({
  produtoId: z.string().min(1),
  origemDepositoId: z.string().min(1),
  destinoDepositoId: z.string().min(1),
  quantidade: z.number().positive("Quantidade deve ser maior que zero"),
  observacao: z.string().max(500).optional(),
});

export const POST = comAuth("ESTOQUISTA", async (req, _ctx, usuario) => {
  const body = transferenciaSchema.parse(await req.json());
  if (body.origemDepositoId === body.destinoDepositoId) {
    throw new ApiError(400, "Depósitos de origem e destino devem ser diferentes");
  }

  const empresaId = usuario.empresaId;
  const [produto, origem, destino] = await Promise.all([
    prisma.produto.findFirst({
      where: { id: body.produtoId, empresaId },
      select: { id: true, sku: true, nome: true, custoMedio: true },
    }),
    prisma.deposito.findFirst({
      where: { id: body.origemDepositoId, empresaId },
      select: { id: true, nome: true },
    }),
    prisma.deposito.findFirst({
      where: { id: body.destinoDepositoId, empresaId },
      select: { id: true, nome: true },
    }),
  ]);
  if (!produto) throw new ApiError(404, "Produto não encontrado");
  if (!origem) throw new ApiError(404, "Depósito de origem não encontrado");
  if (!destino) throw new ApiError(404, "Depósito de destino não encontrado");

  const qtd = new Prisma.Decimal(body.quantidade);
  const documento = `Transferência ${origem.nome} → ${destino.nome}`;

  const resultado = await prisma.$transaction(async (tx) => {
    const saldo = await tx.estoqueDeposito.findUnique({
      where: { produtoId_depositoId: { produtoId: produto.id, depositoId: origem.id } },
    });
    const disponivel = saldo
      ? saldo.quantidade.minus(saldo.reservado)
      : new Prisma.Decimal(0);
    if (disponivel.lt(qtd)) {
      throw new ApiError(
        400,
        `Saldo disponível insuficiente em ${origem.nome} (disponível: ${disponivel.toString()})`,
      );
    }

    await tx.estoqueDeposito.update({
      where: { produtoId_depositoId: { produtoId: produto.id, depositoId: origem.id } },
      data: { quantidade: { decrement: qtd } },
    });
    await tx.estoqueDeposito.upsert({
      where: { produtoId_depositoId: { produtoId: produto.id, depositoId: destino.id } },
      create: { produtoId: produto.id, depositoId: destino.id, quantidade: qtd },
      update: { quantidade: { increment: qtd } },
    });

    const saida = await tx.movimentoEstoque.create({
      data: {
        produtoId: produto.id,
        depositoId: origem.id,
        tipo: "TRANSFERENCIA_SAIDA",
        quantidade: qtd,
        custoUnitario: produto.custoMedio,
        documento,
        origemTipo: "TRANSFERENCIA",
        observacao: body.observacao,
      },
    });
    const entrada = await tx.movimentoEstoque.create({
      data: {
        produtoId: produto.id,
        depositoId: destino.id,
        tipo: "TRANSFERENCIA_ENTRADA",
        quantidade: qtd,
        custoUnitario: produto.custoMedio,
        documento,
        origemTipo: "TRANSFERENCIA",
        origemId: saida.id,
        observacao: body.observacao,
      },
    });
    return { saida, entrada };
  });

  return NextResponse.json(
    {
      produto: { id: produto.id, sku: produto.sku, nome: produto.nome },
      origem: origem.nome,
      destino: destino.nome,
      quantidade: body.quantidade,
      movimentos: [resultado.saida.id, resultado.entrada.id],
    },
    { status: 201 },
  );
});

export const GET = comAuth("ESTOQUISTA", async (_req, _ctx, usuario) => {
  const movimentos = await prisma.movimentoEstoque.findMany({
    where: {
      tipo: { in: ["TRANSFERENCIA_ENTRADA", "TRANSFERENCIA_SAIDA"] },
      deposito: { empresaId: usuario.empresaId },
    },
    include: {
      produto: { select: { id: true, sku: true, nome: true } },
      deposito: { select: { id: true, nome: true } },
    },
    orderBy: { criadoEm: "desc" },
    take: 50,
  });
  return NextResponse.json(movimentos);
});
