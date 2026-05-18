import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { empresaAtualId } from "@/lib/sessao";

export async function GET(req: NextRequest) {
  const empresaId = await empresaAtualId();
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
}

export async function PATCH(req: NextRequest) {
  const { id, feedback, resolver } = (await req.json()) as {
    id: string;
    feedback?: "UTIL" | "NAO_UTIL" | "INCORRETO";
    resolver?: boolean;
  };
  const insight = await prisma.insightIA.update({
    where: { id },
    data: {
      ...(feedback && { feedback }),
      ...(resolver && { resolvidoEm: new Date() }),
    },
  });
  return NextResponse.json(insight);
}
