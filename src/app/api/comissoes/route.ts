import { NextRequest, NextResponse } from "next/server";
import { apurarComissaoVendedor, fecharApuracaoMensal } from "@/lib/comissao/calculo";
import { prisma } from "@/lib/db";
import { empresaAtualId } from "@/lib/sessao";

export async function GET(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const competencia = req.nextUrl.searchParams.get("competencia");
  const vendedorId = req.nextUrl.searchParams.get("vendedorId");
  if (competencia && vendedorId) {
    const out = await apurarComissaoVendedor({
      empresaId,
      vendedorId,
      competencia: new Date(competencia + "-01"),
    });
    return NextResponse.json(out);
  }
  const apuracoes = await prisma.apuracaoComissao.findMany({
    where: { empresaId, ...(competencia && { competencia }) },
    orderBy: { criadoEm: "desc" },
    take: 100,
  });
  return NextResponse.json(apuracoes);
}

export async function POST(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const { competencia } = (await req.json()) as { competencia: string };
  const out = await fecharApuracaoMensal({
    empresaId,
    competencia: new Date(competencia + "-01"),
  });
  return NextResponse.json(out);
}
