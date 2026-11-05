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

const STATUS_POR_ACAO = { pausar: "PAUSADA", retomar: "ATIVA", cancelar: "CANCELADA" } as const;

export const POST = comAuth("FINANCEIRO", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const body = schema.parse(await req.json());
  if (body.acao === "criar") {
    const cliente = await prisma.cliente.findFirst({
      where: { id: body.clienteId, empresaId },
      select: { id: true },
    });
    if (!cliente) throw new ApiError(404, "Cliente não encontrado");
    // Registra o dono ANTES de falar com o PSP: o id é global, então um id já
    // usado (por esta ou por outra empresa) é recusado.
    const existente = await prisma.pixRecorrencia.findUnique({
      where: { id: body.id },
      select: { id: true },
    });
    if (existente) throw new ApiError(409, "Já existe uma recorrência com este id");
    await prisma.pixRecorrencia.create({
      data: {
        id: body.id,
        empresaId,
        clienteId: cliente.id,
        descricao: body.descricao,
        valor: body.valor,
        periodicidade: body.periodicidade,
      },
    });
    try {
      const data = await criarAssinatura({
        id: body.id,
        clienteId: cliente.id,
        descricao: body.descricao,
        valor: body.valor,
        periodicidade: body.periodicidade,
        dataInicio: new Date(body.dataInicio),
        dataFim: body.dataFim ? new Date(body.dataFim) : undefined,
        diaCobranca: body.diaCobranca,
      });
      return NextResponse.json(data);
    } catch (e) {
      // PSP recusou: libera o id para nova tentativa.
      await prisma.pixRecorrencia.deleteMany({ where: { id: body.id, empresaId } });
      throw e;
    }
  }

  // Demais ações: só sobre recorrência da empresa da sessão.
  const rec = await prisma.pixRecorrencia.findFirst({
    where: { id: body.idRec, empresaId },
    select: { id: true, status: true },
  });
  if (!rec) throw new ApiError(404, "Recorrência não encontrada");

  if (body.acao === "cobrar") {
    if (rec.status === "CANCELADA") throw new ApiError(409, "Recorrência cancelada");
    return NextResponse.json(await gerarCobrancaImediata(rec.id, body.valor));
  }
  const data =
    body.acao === "pausar"
      ? await pausarAssinatura(rec.id)
      : body.acao === "retomar"
        ? await retomarAssinatura(rec.id)
        : await cancelarAssinatura(rec.id, body.motivo);
  await prisma.pixRecorrencia.updateMany({
    where: { id: rec.id, empresaId },
    data: { status: STATUS_POR_ACAO[body.acao] },
  });
  return NextResponse.json(data);
});
