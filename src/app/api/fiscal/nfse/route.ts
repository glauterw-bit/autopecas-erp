import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cancelarNfse, emitirNfse } from "@/lib/nfe/nfse";
import { empresaAtualId } from "@/lib/sessao";

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

export async function POST(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const body = schema.parse(await req.json());
  try {
    if (body.acao === "emitir") {
      const nota = await emitirNfse({ empresaId, ...body });
      return NextResponse.json(nota);
    }
    const out = await cancelarNfse(body.notaId, body.motivo);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 });
  }
}
