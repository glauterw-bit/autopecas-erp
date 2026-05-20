import { NextRequest, NextResponse } from "next/server";
import { gerarBalanco, gerarDFC, gerarDLPA } from "@/lib/contabil/balanco";
import { empresaAtualId } from "@/lib/sessao";

export async function GET(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const tipo = req.nextUrl.searchParams.get("tipo") ?? "bp"; // bp | dfc | dlpa
  if (tipo === "bp") {
    const dataRef = req.nextUrl.searchParams.get("data");
    const ref = dataRef ? new Date(dataRef) : new Date();
    const bp = await gerarBalanco({ empresaId, dataReferencia: ref });
    return NextResponse.json(bp);
  }
  if (tipo === "dfc") {
    const inicio = req.nextUrl.searchParams.get("inicio");
    const fim = req.nextUrl.searchParams.get("fim");
    const hoje = new Date();
    const dfc = await gerarDFC({
      empresaId,
      inicio: inicio ? new Date(inicio) : new Date(hoje.getFullYear(), hoje.getMonth(), 1),
      fim: fim ? new Date(fim) : hoje,
    });
    return NextResponse.json(dfc);
  }
  if (tipo === "dlpa") {
    const exercicio = Number(req.nextUrl.searchParams.get("exercicio") ?? new Date().getFullYear());
    const dlpa = await gerarDLPA({ empresaId, exercicio });
    return NextResponse.json(dlpa);
  }
  return NextResponse.json({ erro: "tipo inválido (bp|dfc|dlpa)" }, { status: 400 });
}
