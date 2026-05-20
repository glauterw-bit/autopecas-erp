import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cancelarMdfe, emitirMdfe, encerrarMdfe } from "@/lib/nfe/mdfe";
import { empresaAtualId } from "@/lib/sessao";

const emitirSchema = z.object({
  acao: z.literal("emitir"),
  ufInicio: z.string().length(2),
  ufFim: z.string().length(2),
  ufsPercurso: z.array(z.string().length(2)).optional(),
  veiculo: z.object({
    placa: z.string(),
    renavam: z.string().optional(),
    tara: z.number().positive(),
    capacidadeKg: z.number().optional(),
    tipoRodado: z.string(),
    tipoCarroceria: z.string(),
    uf: z.string().length(2),
  }),
  motorista: z.object({
    cpf: z.string(),
    nome: z.string(),
  }),
  notasFiscaisChaves: z.array(z.string().length(44)),
  cidadeCarregamentoIbge: z.string(),
  cidadeDescarregamentoIbge: z.string(),
  pesoBrutoKg: z.number().positive(),
  valorTotalCarga: z.number().positive(),
});
const encerrarSchema = z.object({
  acao: z.literal("encerrar"),
  chaveMdfe: z.string().length(44),
  ufEncerramento: z.string().length(2),
  cidadeIbge: z.string(),
});
const cancelarSchema = z.object({
  acao: z.literal("cancelar"),
  chaveMdfe: z.string().length(44),
  justificativa: z.string().min(15),
});

const schema = z.discriminatedUnion("acao", [emitirSchema, encerrarSchema, cancelarSchema]);

export async function POST(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const body = schema.parse(await req.json());
  try {
    if (body.acao === "emitir") {
      const data = await emitirMdfe({ empresaId, ...body });
      return NextResponse.json(data);
    }
    if (body.acao === "encerrar") {
      const data = await encerrarMdfe(body);
      return NextResponse.json(data);
    }
    const data = await cancelarMdfe(body.chaveMdfe, body.justificativa);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 });
  }
}
