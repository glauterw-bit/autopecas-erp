import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { emitirNotaFiscal } from "@/lib/nfe/emissor";

type Ctx = { params: Promise<{ id: string }> };

export const POST = comAuth<Ctx>("CAIXA", async (_req, ctx, usuario) => {
  const { id } = await ctx.params;
  const venda = await prisma.venda.findFirst({
    where: { id, empresaId: usuario.empresaId },
    select: { id: true, tipo: true, status: true },
  });
  if (!venda) throw new ApiError(404, "Venda não encontrada");
  // F3: só emite NF de VENDA já PAGA — nunca de orçamento/condicional/aberta.
  if (venda.tipo !== "VENDA" || venda.status !== "PAGA") {
    throw new ApiError(
      422,
      `Só é possível emitir nota fiscal de venda paga (tipo ${venda.tipo}, status ${venda.status}).`,
    );
  }
  const nota = await emitirNotaFiscal(venda.id);
  return NextResponse.json(nota);
});
