import { NextRequest, NextResponse } from "next/server";
import { gerarDctfWeb, gerarDEFIS, gerarEfdReinf } from "@/lib/fiscal/declaracoes";
import { empresaAtualId } from "@/lib/sessao";

export async function GET(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const tipo = req.nextUrl.searchParams.get("tipo") ?? "dctf";
  const comp = req.nextUrl.searchParams.get("competencia");
  const hoje = new Date();
  const competencia = comp ? new Date(comp + "-01") : hoje;
  if (tipo === "dctf") {
    return NextResponse.json(await gerarDctfWeb({ empresaId, competencia }));
  }
  if (tipo === "defis") {
    const exercicio = Number(req.nextUrl.searchParams.get("exercicio") ?? hoje.getFullYear() - 1);
    return NextResponse.json(await gerarDEFIS({ empresaId, exercicio }));
  }
  if (tipo === "efd-reinf") {
    return NextResponse.json(await gerarEfdReinf({ empresaId, competencia }));
  }
  return NextResponse.json({ erro: "tipo inválido (dctf|defis|efd-reinf)" }, { status: 400 });
}
