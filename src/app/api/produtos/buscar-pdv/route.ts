import { NextResponse } from "next/server";
import { buscarProdutosPDV } from "@/lib/catalogo/busca";
import { comAuth } from "@/lib/auth/guard";

export const GET = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const termo = req.nextUrl.searchParams.get("q") ?? undefined;
  const versaoId = req.nextUrl.searchParams.get("versao") ?? undefined;
  const pagina = Number(req.nextUrl.searchParams.get("pagina")) || 1;
  const resultados = await buscarProdutosPDV({ empresaId, termo, versaoId, pagina });
  return NextResponse.json(resultados);
});
