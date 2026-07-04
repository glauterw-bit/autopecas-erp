import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";

// Finalização do inventário (só GERENTE+)
// ---------------------------------------
// POST sem corpo (ou {}): para cada item contado com divergência gera
//   MovimentoEstoque AJUSTE_POSITIVO/AJUSTE_NEGATIVO (origemTipo INVENTARIO)
//   e ajusta o EstoqueDeposito para a quantidade contada; status → AJUSTADO.
//   Idempotente: erro 409 se já AJUSTADO.
// POST { acao: "cancelar" }: status → CANCELADO.

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ acao: z.literal("cancelar").optional() });

export const POST = comAuth<Ctx>("GERENTE", async (req, ctx, usuario) => {
  const { id } = await ctx.params;

  const texto = await req.text();
  let body: z.infer<typeof schema> = {};
  if (texto.trim()) {
    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      throw new ApiError(400, "Corpo da requisição não é JSON válido");
    }
    body = schema.parse(json);
  }

  const inventario = await prisma.inventario.findFirst({
    where: { id, empresaId: usuario.empresaId },
    select: { id: true, depositoId: true, status: true },
  });
  if (!inventario) throw new ApiError(404, "Inventário não encontrado");
  if (inventario.status === "AJUSTADO") {
    throw new ApiError(409, "Inventário já foi ajustado");
  }
  if (inventario.status === "CANCELADO") {
    throw new ApiError(400, "Inventário cancelado não pode ser finalizado");
  }

  if (body.acao === "cancelar") {
    const cancelado = await prisma.inventario.update({
      where: { id: inventario.id },
      data: { status: "CANCELADO", finalizadoEm: new Date() },
      select: { id: true, status: true, finalizadoEm: true },
    });
    return NextResponse.json(cancelado);
  }

  const agora = new Date();

  const itensAjustados = await prisma.$transaction(async (tx) => {
    // trava contra dupla finalização concorrente
    const marcado = await tx.inventario.updateMany({
      where: { id: inventario.id, status: { in: ["EM_CONTAGEM", "CONFERENCIA"] } },
      data: { status: "AJUSTADO", finalizadoEm: agora },
    });
    if (marcado.count !== 1) throw new ApiError(409, "Inventário já foi ajustado");

    // Itens e saldo ATUAL lidos DENTRO da transação: o delta é sempre contra o
    // estoque de agora (vendas/entradas entre contagem e finalização não geram
    // ajuste errado baseado no snapshot qtdSistema).
    const itens = await tx.itemInventario.findMany({
      where: { inventarioId: inventario.id, qtdContada: { not: null } },
      include: { produto: { select: { custoMedio: true } } },
    });

    let ajustados = 0;
    for (const item of itens) {
      const contada = item.qtdContada!;
      const saldo = await tx.estoqueDeposito.findUnique({
        where: {
          produtoId_depositoId: {
            produtoId: item.produtoId,
            depositoId: inventario.depositoId,
          },
        },
        select: { quantidade: true },
      });
      const saldoAtual = saldo ? saldo.quantidade : new Prisma.Decimal(0);
      const diferenca = contada.minus(saldoAtual);
      if (diferenca.isZero()) continue;

      await tx.movimentoEstoque.create({
        data: {
          produtoId: item.produtoId,
          depositoId: inventario.depositoId,
          tipo: diferenca.gt(0) ? "AJUSTE_POSITIVO" : "AJUSTE_NEGATIVO",
          quantidade: diferenca.abs(),
          custoUnitario: item.produto.custoMedio,
          documento: `Inventário ${inventario.id}`,
          origemTipo: "INVENTARIO",
          origemId: inventario.id,
        },
      });
      await tx.estoqueDeposito.upsert({
        where: {
          produtoId_depositoId: {
            produtoId: item.produtoId,
            depositoId: inventario.depositoId,
          },
        },
        create: {
          produtoId: item.produtoId,
          depositoId: inventario.depositoId,
          quantidade: contada,
        },
        update: { quantidade: contada },
      });
      ajustados += 1;
    }
    return ajustados;
  });

  return NextResponse.json({
    id: inventario.id,
    status: "AJUSTADO",
    finalizadoEm: agora,
    itensAjustados,
  });
});
