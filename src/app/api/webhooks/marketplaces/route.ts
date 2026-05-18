import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Webhook unificado para marketplaces (ML notifications, Shopee push, etc.).
// Persistimos o payload bruto e enfileiramos para o worker processar — não
// bloqueamos a resposta para evitar timeout do provedor.

export async function POST(req: NextRequest) {
  const body = await req.json();
  const plataforma = req.nextUrl.searchParams.get("plataforma") ?? "DESCONHECIDO";

  // Em produção isso vai pra fila BullMQ. Aqui só logamos como InsightIA
  // de tipo TENDENCIA_DEMANDA (placeholder) e retornamos 200 rápido.
  await prisma.insightIA.create({
    data: {
      empresaId: (body?.empresaId as string) ?? "",
      tipo: "TENDENCIA_DEMANDA",
      severidade: "INFO",
      titulo: `Webhook ${plataforma}`,
      descricao: JSON.stringify(body).slice(0, 500),
      dadosReferencia: body,
    },
  }).catch(() => {/* sem empresa associada, ignora */});

  return NextResponse.json({ ok: true });
}
