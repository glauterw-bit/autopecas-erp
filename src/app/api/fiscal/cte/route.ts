import { NextResponse } from "next/server";
import { z } from "zod";
import { emitirCte, importarCteEntrada } from "@/lib/nfe/cte";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";

const emitirSchema = z.object({
  acao: z.literal("emitir"),
  tomador: z.object({ cnpjCpf: z.string(), nome: z.string(), uf: z.string().length(2) }),
  remetente: z.object({ cnpjCpf: z.string(), nome: z.string() }),
  destinatario: z.object({ cnpjCpf: z.string(), nome: z.string() }),
  modal: z.enum(["01", "02", "03", "04", "05", "06"]),
  tipoCte: z.enum(["0", "1", "2", "3"]),
  cfop: z.string(),
  valorTotal: z.number().positive(),
  valorCarga: z.number().positive(),
  pesoBrutoKg: z.number().positive(),
  ufInicio: z.string().length(2),
  ufFim: z.string().length(2),
  cidadeInicioIbge: z.string(),
  cidadeFimIbge: z.string(),
  notasFiscaisVinculadas: z.array(z.string()).optional(),
});

const importarSchema = z.object({
  acao: z.literal("importar"),
  fornecedorId: z.string(),
  chaveCte: z.string().length(44),
  numero: z.string(),
  serie: z.string(),
  dataEmissao: z.string(),
  valorTotal: z.number().positive(),
  vencimento: z.string(),
});

const schema = z.discriminatedUnion("acao", [emitirSchema, importarSchema]);

export const POST = comAuth("FINANCEIRO", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const body = schema.parse(await req.json());
  if (body.acao === "emitir") {
    const data = await emitirCte({ empresaId, ...body });
    return NextResponse.json(data);
  }
  const fornecedor = await prisma.fornecedor.findFirst({
    where: { id: body.fornecedorId, empresaId },
    select: { id: true },
  });
  if (!fornecedor) throw new ApiError(404, "Fornecedor não encontrado");
  const data = await importarCteEntrada({
    empresaId,
    fornecedorId: body.fornecedorId,
    chaveCte: body.chaveCte,
    numero: body.numero,
    serie: body.serie,
    dataEmissao: new Date(body.dataEmissao),
    valorTotal: body.valorTotal,
    vencimento: new Date(body.vencimento),
  });
  return NextResponse.json(data);
});
