import { NextResponse } from "next/server";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { carregarFichaCliente } from "@/lib/crm/consultas";

// Ficha da oficina / cliente B2B (VENDEDOR).
// Crédito, limite, saldo e documento completo só para FINANCEIRO+ ou para a
// pessoa vendedora responsável (LGPD) — os demais recebem credito = null.
type Ctx = { params: Promise<{ id: string }> };

export const GET = comAuth<Ctx>("VENDEDOR", async (_req, ctx, usuario) => {
  const { id } = await ctx.params;
  const ficha = await carregarFichaCliente(usuario.empresaId, id, usuario);
  if (!ficha) throw new ApiError(404, "Cliente não encontrado");
  return NextResponse.json(ficha);
});
