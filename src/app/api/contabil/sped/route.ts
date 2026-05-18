import { NextRequest, NextResponse } from "next/server";
import { gerarSpedECD, gerarSpedEFD } from "@/lib/contabil/sped";
import { empresaAtualId } from "@/lib/sessao";

export async function GET(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const tipo = req.nextUrl.searchParams.get("tipo") ?? "ECD"; // ECD | EFD
  const inicioParam = req.nextUrl.searchParams.get("inicio");
  const fimParam = req.nextUrl.searchParams.get("fim");
  const hoje = new Date();
  const inicio = inicioParam ? new Date(inicioParam) : new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fim = fimParam ? new Date(fimParam) : hoje;
  const arquivo = tipo === "EFD"
    ? await gerarSpedEFD({ empresaId, inicio, fim })
    : await gerarSpedECD({ empresaId, inicio, fim });
  return new NextResponse(arquivo, {
    headers: {
      "Content-Type": "text/plain; charset=iso-8859-1",
      "Content-Disposition": `attachment; filename="SPED-${tipo}-${inicio.toISOString().slice(0, 10)}.txt"`,
    },
  });
}
