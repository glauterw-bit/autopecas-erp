import { NextRequest, NextResponse } from "next/server";
import { buscarProdutosPDV } from "@/lib/catalogo/busca";
import { empresaAtualId } from "@/lib/sessao";

export async function GET(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const termo = req.nextUrl.searchParams.get("q") ?? undefined;
  const versaoId = req.nextUrl.searchParams.get("versao") ?? undefined;
  const resultados = await buscarProdutosPDV({ empresaId, termo, versaoId });
  return NextResponse.json(resultados);
}
