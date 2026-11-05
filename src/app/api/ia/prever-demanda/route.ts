import { NextResponse } from "next/server";
import { gerarInsightsRupturaEmpresa, preverProduto } from "@/lib/ai/prediction";
import { exigirLimiteIA } from "@/lib/ai/limite";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";

export const GET = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  await exigirLimiteIA("previsao", usuario.id);
  const produtoId = req.nextUrl.searchParams.get("produtoId");
  if (!produtoId) return NextResponse.json({ erro: "produtoId obrigatório" }, { status: 400 });
  const produto = await prisma.produto.findFirst({
    where: { id: produtoId, empresaId: usuario.empresaId },
    select: { id: true },
  });
  if (!produto) throw new ApiError(404, "Produto não encontrado");
  const prev = await preverProduto(usuario.empresaId, produtoId);
  return NextResponse.json(prev);
});

export const POST = comAuth("GERENTE", async (_req, _ctx, usuario) => {
  // Lote pesado: por empresa, não por usuário.
  await exigirLimiteIA("previsaoLote", usuario.empresaId);
  const criados = await gerarInsightsRupturaEmpresa(usuario.empresaId);
  return NextResponse.json({ insightsCriados: criados });
});
