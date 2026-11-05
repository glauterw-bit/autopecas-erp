import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { comAuth } from "@/lib/auth/guard";
import { exigirProduto } from "@/lib/produtos/aplicacoes";

// Listas para escolher o veículo, em cascata:
//   sem parâmetro          → montadoras
//   ?montadoraId=…         → modelos da montadora
//   ?modeloId=…            → versões do modelo
// Catálogo compartilhado (não tem empresaId); a rota exige produto da empresa.

type Ctx = { params: Promise<{ id: string }> };

export const GET = comAuth<Ctx>("ESTOQUISTA", async (req, ctx, usuario) => {
  const { id } = await ctx.params;
  await exigirProduto(id, usuario.empresaId);
  const q = req.nextUrl.searchParams;
  const montadoraId = q.get("montadoraId");
  const modeloId = q.get("modeloId");
  if (modeloId) {
    const versoes = await prisma.versaoVeiculo.findMany({
      where: { modeloId },
      select: { id: true, descricao: true, motor: true, anoInicio: true, anoFim: true },
      orderBy: [{ anoInicio: "asc" }, { descricao: "asc" }],
      take: 500,
    });
    return NextResponse.json(versoes);
  }
  if (montadoraId) {
    const modelos = await prisma.modeloVeiculo.findMany({
      where: { montadoraId },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
      take: 500,
    });
    return NextResponse.json(modelos);
  }
  const montadoras = await prisma.montadora.findMany({
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });
  return NextResponse.json(montadoras);
});
