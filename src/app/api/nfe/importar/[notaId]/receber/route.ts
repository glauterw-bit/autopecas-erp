import { NextResponse } from "next/server";
import { comAuth } from "@/lib/auth/guard";
import { receberNotaEntrada } from "@/lib/compras/receber-nota";

// Confirma o recebimento físico da nota: entrada em estoque + kardex +
// atualização de custo médio/última compra. ESTOQUISTA já pode receber.

type Ctx = { params: Promise<{ notaId: string }> };

export const POST = comAuth<Ctx>("ESTOQUISTA", async (_req, ctx, usuario) => {
  const { notaId } = await ctx.params;
  const resultado = await receberNotaEntrada({ empresaId: usuario.empresaId, notaId });
  return NextResponse.json(resultado);
});
