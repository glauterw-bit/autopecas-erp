import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  cancelarAssinatura,
  criarAssinatura,
  gerarCobrancaImediata,
  pausarAssinatura,
  retomarAssinatura,
} from "@/lib/pagamentos/pix-recorrente";

const criarSchema = z.object({
  acao: z.literal("criar"),
  id: z.string(),
  clienteId: z.string(),
  descricao: z.string(),
  valor: z.number().positive(),
  periodicidade: z.enum(["SEMANAL", "MENSAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"]),
  dataInicio: z.string(),
  dataFim: z.string().optional(),
  diaCobranca: z.number().int().min(1).max(28),
});
const pausarSchema = z.object({ acao: z.literal("pausar"), idRec: z.string() });
const retomarSchema = z.object({ acao: z.literal("retomar"), idRec: z.string() });
const cancelarSchema = z.object({ acao: z.literal("cancelar"), idRec: z.string(), motivo: z.string() });
const cobrarSchema = z.object({ acao: z.literal("cobrar"), idRec: z.string(), valor: z.number().optional() });

const schema = z.discriminatedUnion("acao", [
  criarSchema,
  pausarSchema,
  retomarSchema,
  cancelarSchema,
  cobrarSchema,
]);

export async function POST(req: NextRequest) {
  const body = schema.parse(await req.json());
  try {
    if (body.acao === "criar") {
      const data = await criarAssinatura({
        id: body.id,
        clienteId: body.clienteId,
        descricao: body.descricao,
        valor: body.valor,
        periodicidade: body.periodicidade,
        dataInicio: new Date(body.dataInicio),
        dataFim: body.dataFim ? new Date(body.dataFim) : undefined,
        diaCobranca: body.diaCobranca,
      });
      return NextResponse.json(data);
    }
    if (body.acao === "pausar") return NextResponse.json(await pausarAssinatura(body.idRec));
    if (body.acao === "retomar") return NextResponse.json(await retomarAssinatura(body.idRec));
    if (body.acao === "cancelar") return NextResponse.json(await cancelarAssinatura(body.idRec, body.motivo));
    return NextResponse.json(await gerarCobrancaImediata(body.idRec, body.valor));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 });
  }
}
