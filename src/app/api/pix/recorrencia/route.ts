import { NextResponse } from "next/server";
import { z } from "zod";
import {
  cancelarAssinatura,
  criarAssinatura,
  gerarCobrancaImediata,
  pausarAssinatura,
  retomarAssinatura,
} from "@/lib/pagamentos/pix-recorrente";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";

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

export const POST = comAuth("FINANCEIRO", async (req, _ctx, usuario) => {
  const body = schema.parse(await req.json());
  if (body.acao === "criar") {
    const cliente = await prisma.cliente.findFirst({
      where: { id: body.clienteId, empresaId: usuario.empresaId },
      select: { id: true },
    });
    if (!cliente) throw new ApiError(404, "Cliente não encontrado");
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
});
