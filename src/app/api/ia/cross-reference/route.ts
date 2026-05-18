import { NextRequest, NextResponse } from "next/server";
import { buscarEquivalentes, salvarCrossReference } from "@/lib/ai/cross-reference";
import { empresaAtualId } from "@/lib/sessao";

export async function POST(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const alvo = (await req.json()) as {
    nome: string;
    marca?: string | null;
    codigoOem?: string | null;
    codigoFabricante?: string | null;
    sistema?: string | null;
    salvar?: { origemId: string };
  };
  const resultados = await buscarEquivalentes(empresaId, alvo);
  if (alvo.salvar && resultados[0] && resultados[0].confianca >= 0.9 && resultados[0].tipo !== "NAO_COMPATIVEL") {
    await salvarCrossReference(
      alvo.salvar.origemId,
      resultados[0].id,
      resultados[0].tipo as "EQUIVALENTE" | "SIMILAR" | "SUBSTITUTO" | "KIT_ALTERNATIVO",
      resultados[0].confianca,
    );
  }
  return NextResponse.json(resultados);
}
