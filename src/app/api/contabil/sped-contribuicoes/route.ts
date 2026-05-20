import { NextRequest, NextResponse } from "next/server";
import { gerarSpedContribuicoes } from "@/lib/contabil/sped-contribuicoes";
import { empresaAtualId } from "@/lib/sessao";

export async function GET(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const inicioParam = req.nextUrl.searchParams.get("inicio");
  const fimParam = req.nextUrl.searchParams.get("fim");
  const hoje = new Date();
  const inicio = inicioParam ? new Date(inicioParam) : new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fim = fimParam ? new Date(fimParam) : hoje;
  const arquivo = await gerarSpedContribuicoes({ empresaId, inicio, fim });
  return new NextResponse(arquivo, {
    headers: {
      "Content-Type": "text/plain; charset=iso-8859-1",
      "Content-Disposition": `attachment; filename="SPED-Contribuicoes-${inicio.toISOString().slice(0, 10)}.txt"`,
    },
  });
}
