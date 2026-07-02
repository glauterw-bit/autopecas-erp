import { NextResponse } from "next/server";
import { buscarEquivalentes, salvarCrossReference } from "@/lib/ai/cross-reference";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";

export const POST = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
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
    const origem = await prisma.produto.findFirst({
      where: { id: alvo.salvar.origemId, empresaId },
      select: { id: true },
    });
    if (!origem) throw new ApiError(404, "Produto de origem não encontrado");
    await salvarCrossReference(
      alvo.salvar.origemId,
      resultados[0].id,
      resultados[0].tipo as "EQUIVALENTE" | "SIMILAR" | "SUBSTITUTO" | "KIT_ALTERNATIVO",
      resultados[0].confianca,
    );
  }
  return NextResponse.json(resultados);
});
