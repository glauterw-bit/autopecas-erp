import { NextRequest, NextResponse } from "next/server";
import { gerarDRE } from "@/lib/contabil/dre";
import { empresaAtualId } from "@/lib/sessao";

export async function GET(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const inicioParam = req.nextUrl.searchParams.get("inicio");
  const fimParam = req.nextUrl.searchParams.get("fim");
  const hoje = new Date();
  const inicio = inicioParam ? new Date(inicioParam) : new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fim = fimParam ? new Date(fimParam) : hoje;
  const dre = await gerarDRE({ empresaId, inicio, fim });
  return NextResponse.json(dre);
}
