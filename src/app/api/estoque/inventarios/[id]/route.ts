import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";

// Detalhe e contagem de um inventário
// -----------------------------------
// GET: inventário com itens (para a tela de contagem).
// PUT: { itens: [{ produtoId, qtdContada }] } grava as contagens;
//      { acao: "enviar-conferencia" } muda EM_CONTAGEM → CONFERENCIA.

type Ctx = { params: Promise<{ id: string }> };

const putSchema = z
  .object({
    acao: z.literal("enviar-conferencia").optional(),
    itens: z
      .array(
        z.object({
          produtoId: z.string().min(1),
          qtdContada: z
            .number()
            .min(0, "qtdContada não pode ser negativa")
            .finite()
            .max(99999999, "qtdContada acima do limite permitido"),
        }),
      )
      .min(1)
      .max(500)
      .optional(),
  })
  .refine((v) => v.acao !== undefined || v.itens !== undefined, {
    message: "Informe itens para gravar ou acao 'enviar-conferencia'",
  });

async function buscarInventario(id: string, empresaId: string) {
  const inventario = await prisma.inventario.findFirst({
    where: { id, empresaId },
  });
  if (!inventario) throw new ApiError(404, "Inventário não encontrado");
  return inventario;
}

export const GET = comAuth<Ctx>("ESTOQUISTA", async (_req, ctx, usuario) => {
  const { id } = await ctx.params;
  const inventario = await prisma.inventario.findFirst({
    where: { id, empresaId: usuario.empresaId },
    include: {
      deposito: { select: { id: true, nome: true } },
      itens: {
        include: {
          produto: { select: { id: true, sku: true, nome: true, localizacao: true } },
        },
        orderBy: { produto: { nome: "asc" } },
      },
    },
  });
  if (!inventario) throw new ApiError(404, "Inventário não encontrado");
  return NextResponse.json(inventario);
});

export const PUT = comAuth<Ctx>("ESTOQUISTA", async (req, ctx, usuario) => {
  const { id } = await ctx.params;
  const body = putSchema.parse(await req.json());
  const inventario = await buscarInventario(id, usuario.empresaId);

  if (inventario.status === "AJUSTADO" || inventario.status === "CANCELADO") {
    throw new ApiError(400, `Inventário ${inventario.status.toLowerCase()} não pode ser alterado`);
  }

  let gravados = 0;
  if (body.itens) {
    const resultados = await prisma.$transaction(
      body.itens.map((item) =>
        prisma.itemInventario.updateMany({
          where: { inventarioId: inventario.id, produtoId: item.produtoId },
          data: { qtdContada: new Prisma.Decimal(item.qtdContada) },
        }),
      ),
    );
    gravados = resultados.reduce((acc, r) => acc + r.count, 0);
  }

  let status: (typeof inventario)["status"] = inventario.status;
  if (body.acao === "enviar-conferencia") {
    if (inventario.status !== "EM_CONTAGEM") {
      throw new ApiError(400, "Só inventários EM_CONTAGEM podem ir para conferência");
    }
    const atualizado = await prisma.inventario.update({
      where: { id: inventario.id },
      data: { status: "CONFERENCIA" },
      select: { status: true },
    });
    status = atualizado.status;
  }

  return NextResponse.json({ id: inventario.id, status, itensGravados: gravados });
});
