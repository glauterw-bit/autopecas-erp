import { NextResponse } from "next/server";
import { z } from "zod";
import {
  cancelarNotaFiscal,
  emitirCartaCorrecao,
  inutilizarRange,
  manifestarDestinatario,
  baixarDocumentos,
} from "@/lib/nfe/operacoes";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";

const cancelarSchema = z.object({ acao: z.literal("cancelar"), notaId: z.string(), justificativa: z.string().min(15) });
const cceSchema = z.object({ acao: z.literal("cce"), notaId: z.string(), correcao: z.string().min(15) });
const inutilizarSchema = z.object({
  acao: z.literal("inutilizar"),
  serie: z.string(),
  numeroInicial: z.number().int().positive(),
  numeroFinal: z.number().int().positive(),
  justificativa: z.string().min(15),
});
const manifestarSchema = z.object({
  acao: z.literal("manifestar"),
  chaveAcesso: z.string().length(44),
  evento: z.enum(["CONFIRMACAO", "CIENCIA", "DESCONHECIMENTO", "OPERACAO_NAO_REALIZADA"]),
  justificativa: z.string().optional(),
});
const baixarSchema = z.object({ acao: z.literal("baixar"), notaId: z.string() });

const schema = z.discriminatedUnion("acao", [
  cancelarSchema,
  cceSchema,
  inutilizarSchema,
  manifestarSchema,
  baixarSchema,
]);

async function exigirNotaDaEmpresa(notaId: string, empresaId: string) {
  const nota = await prisma.notaFiscal.findFirst({
    where: { id: notaId, empresaId },
    select: { id: true },
  });
  if (!nota) throw new ApiError(404, "Nota fiscal não encontrada");
}

export const POST = comAuth("FINANCEIRO", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const body = schema.parse(await req.json());
  if (body.acao === "cancelar") {
    await exigirNotaDaEmpresa(body.notaId, empresaId);
    const out = await cancelarNotaFiscal(body.notaId, body.justificativa);
    return NextResponse.json(out);
  }
  if (body.acao === "cce") {
    await exigirNotaDaEmpresa(body.notaId, empresaId);
    const out = await emitirCartaCorrecao(body.notaId, body.correcao);
    return NextResponse.json(out);
  }
  if (body.acao === "inutilizar") {
    const out = await inutilizarRange({ empresaId, ...body });
    return NextResponse.json(out);
  }
  if (body.acao === "manifestar") {
    const out = await manifestarDestinatario({
      empresaId,
      chaveAcesso: body.chaveAcesso,
      evento: body.evento,
      justificativa: body.justificativa,
    });
    return NextResponse.json(out);
  }
  await exigirNotaDaEmpresa(body.notaId, empresaId);
  const out = await baixarDocumentos(body.notaId);
  return NextResponse.json(out);
});
