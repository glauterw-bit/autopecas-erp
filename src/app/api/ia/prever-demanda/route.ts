import { NextRequest, NextResponse } from "next/server";
import { gerarInsightsRupturaEmpresa, preverProduto } from "@/lib/ai/prediction";
import { empresaAtualId } from "@/lib/sessao";

export async function GET(req: NextRequest) {
  const produtoId = req.nextUrl.searchParams.get("produtoId");
  if (!produtoId) return NextResponse.json({ erro: "produtoId obrigatório" }, { status: 400 });
  const prev = await preverProduto(produtoId);
  return NextResponse.json(prev);
}

export async function POST() {
  const empresaId = await empresaAtualId();
  const criados = await gerarInsightsRupturaEmpresa(empresaId);
  return NextResponse.json({ insightsCriados: criados });
}
