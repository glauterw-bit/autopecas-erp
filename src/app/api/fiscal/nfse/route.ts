import { NextResponse } from "next/server";
import { z } from "zod";
import { cancelarNfse, emitirNfse } from "@/lib/nfe/nfse";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";

const itemSchema = z.object({
  codigoServico: z.string(),
  descricao: z.string(),
  quantidade: z.number().positive(),
  valorUnitario: z.number().positive(),
  aliquotaIss: z.number().min(0).max(10),
  retencaoIss: z.boolean().optional(),
});

const emitirSchema = z.object({
  acao: z.literal("emitir"),
  vendaId: z.string().optional(),
  tomadorCpfCnpj: z.string(),
  tomadorNome: z.string(),
  tomadorEmail: z.string().email().optional(),
  itens: z.array(itemSchema).min(1),
  observacoes: z.string().optional(),
});
const cancelarSchema = z.object({
  acao: z.literal("cancelar"),
  notaId: z.string(),
  motivo: z.string().min(10),
});

const schema = z.discriminatedUnion("acao", [emitirSchema, cancelarSchema]);

export const POST = comAuth("FINANCEIRO", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const body = schema.parse(await req.json());
  if (body.acao === "emitir") {
    const nota = await emitirNfse({ empresaId, ...body });
    return NextResponse.json(nota);
  }
  const nota = await prisma.notaFiscal.findFirst({
    where: { id: body.notaId, empresaId },
    select: { id: true },
  });
  if (!nota) throw new ApiError(404, "Nota fiscal não encontrada");
  const out = await cancelarNfse(body.notaId, body.motivo, empresaId);
  return NextResponse.json(out);
});
