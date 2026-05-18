import { NextRequest, NextResponse } from "next/server";
import { emitirNotaFiscal } from "@/lib/nfe/emissor";

export async function POST(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const nota = await emitirNotaFiscal(id);
    return NextResponse.json(nota);
  } catch (err) {
    return NextResponse.json(
      { erro: err instanceof Error ? err.message : "Erro ao emitir nota" },
      { status: 400 },
    );
  }
}
