import { NextResponse } from "next/server";
import { comAuth } from "@/lib/auth/guard";
import { sincronizarNota } from "@/lib/nfe/sincronizar";

// Botão "Atualizar situação" da nota: consulta a Focus NFe (GET /v2/nfe/{ref})
// e grava o resultado. VENDEDOR ou acima; a nota é buscada só na empresa da sessão.
type Ctx = { params: Promise<{ id: string }> };

export const POST = comAuth<Ctx>("VENDEDOR", async (_req, ctx, usuario) => {
  const { id } = await ctx.params;
  const r = await sincronizarNota(id, { empresaId: usuario.empresaId, usuarioId: usuario.id });
  return NextResponse.json(r);
});
