import { NextResponse } from "next/server";
import { buscarProdutosPDV } from "@/lib/catalogo/busca";
import { comAuth } from "@/lib/auth/guard";

export const GET = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const termo = req.nextUrl.searchParams.get("q") ?? undefined;
  const versaoId = req.nextUrl.searchParams.get("versao") ?? undefined;
  const resultados = await buscarProdutosPDV({ empresaId, termo, versaoId });
  return NextResponse.json(resultados);
});
