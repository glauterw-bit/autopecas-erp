import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { exigirLimiteIA } from "@/lib/ai/limite";

export const GET = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  await exigirLimiteIA("insights", usuario.id);
  const empresaId = usuario.empresaId;
  const tipo = req.nextUrl.searchParams.get("tipo");
  const aberto = req.nextUrl.searchParams.get("aberto") !== "false";
  const insights = await prisma.insightIA.findMany({
    where: {
      empresaId,
      ...(tipo && {
        tipo: tipo as
          | "RUPTURA_PREDITIVA"
          | "EXCESSO_ESTOQUE"
          | "MARGEM_BAIXA"
          | "OPORTUNIDADE_PRECO"
          | "ABANDONO_CLIENTE"
          | "CROSS_SELL"
          | "FRAUDE_POTENCIAL"
          | "TENDENCIA_DEMANDA"
          | "COMPRA_SUGERIDA"
          | "ANUNCIO_FRACO"
          | "CADASTRO_DUPLICADO"
          | "PRODUTO_OBSOLETO",
      }),
      ...(aberto && { resolvidoEm: null }),
    },
    orderBy: [{ severidade: "asc" }, { criadoEm: "desc" }],
    take: 200,
  });
  return NextResponse.json(insights);
});

export const PATCH = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  await exigirLimiteIA("insights", usuario.id);
  const { id, feedback, resolver } = (await req.json()) as {
    id: string;
    feedback?: "UTIL" | "NAO_UTIL" | "INCORRETO";
    resolver?: boolean;
  };
  const existente = await prisma.insightIA.findFirst({
    where: { id, empresaId: usuario.empresaId },
    select: { id: true },
  });
  if (!existente) throw new ApiError(404, "Insight não encontrado");
  const insight = await prisma.insightIA.update({
    where: { id: existente.id },
    data: {
      ...(feedback && { feedback }),
      ...(resolver && { resolvidoEm: new Date() }),
    },
  });
  return NextResponse.json(insight);
});
