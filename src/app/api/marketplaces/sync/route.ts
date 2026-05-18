import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sincronizarConta } from "@/lib/marketplaces/unified";
import { empresaAtualId } from "@/lib/sessao";

export async function POST(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const { contaId } = (await req.json()) as { contaId?: string };
  if (contaId) {
    const out = await sincronizarConta(contaId);
    return NextResponse.json(out);
  }
  // sincroniza todas
  const contas = await prisma.marketplaceConta.findMany({
    where: { empresaId, ativa: true },
    select: { id: true },
  });
  const resultados = [];
  for (const c of contas) {
    try {
      resultados.push({ contaId: c.id, ok: true, ...(await sincronizarConta(c.id)) });
    } catch (e) {
      resultados.push({ contaId: c.id, ok: false, erro: (e as Error).message });
    }
  }
  return NextResponse.json(resultados);
}
