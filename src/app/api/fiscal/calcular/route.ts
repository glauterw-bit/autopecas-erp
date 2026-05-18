import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calcularItemFiscal } from "@/lib/fiscal/calculo";

const schema = z.object({
  valorProdutos: z.number().positive(),
  frete: z.number().nonnegative().optional(),
  desconto: z.number().nonnegative().optional(),
  ufOrigem: z.string().length(2),
  ufDestino: z.string().length(2),
  origemFiscal: z.number().int().min(0).max(8).default(0),
  cstIcms: z.string(),
  aliquotaInterna: z.number().optional(),
  mvaSt: z.number().optional(),
  ipiAliquota: z.number().optional(),
  regime: z.enum(["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL"]),
  consumidorFinal: z.boolean().default(true),
  contribuinteIcms: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const body = schema.parse(await req.json());
  const resultado = calcularItemFiscal(body);
  return NextResponse.json(resultado);
}
