import { NextRequest, NextResponse } from "next/server";
import { apurarPGDAS, montarDAS } from "@/lib/fiscal/simples-nacional";
import { prisma } from "@/lib/db";
import { empresaAtualId } from "@/lib/sessao";

export async function GET(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const comp = req.nextUrl.searchParams.get("competencia");
  const anexo = (req.nextUrl.searchParams.get("anexo") ?? "I") as "I" | "II" | "III" | "IV" | "V";
  const competencia = comp ? new Date(comp + "-01") : new Date();
  const apuracao = await apurarPGDAS({ empresaId, competencia, anexo });
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: empresaId },
    select: { cnpj: true },
  });
  const vencimento = new Date(competencia.getFullYear(), competencia.getMonth() + 1, 20);
  const das = montarDAS(apuracao, empresa.cnpj, vencimento);
  return NextResponse.json({ apuracao, das });
}
