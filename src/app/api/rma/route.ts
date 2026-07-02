import { NextResponse } from "next/server";
import { z } from "zod";
import { abrirRMA, autorizarRMA, registrarRecebimento, resolverRMA } from "@/lib/rma/rma";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";

export const GET = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const status = req.nextUrl.searchParams.get("status");
  const rmas = await prisma.solicitacaoRMA.findMany({
    where: { empresaId, ...(status && { status: status as "AGUARDANDO_AUTORIZACAO" | "AUTORIZADA" | "AGUARDANDO_RECEBIMENTO" | "RECEBIDA" | "EM_ANALISE" | "APROVADA" | "RECUSADA" | "CONCLUIDA" }) },
    orderBy: { abertaEm: "desc" },
    take: 100,
  });
  return NextResponse.json(rmas);
});

const abrirSchema = z.object({
  acao: z.literal("abrir"),
  vendaId: z.string().optional(),
  itemVendaId: z.string().optional(),
  produtoId: z.string(),
  clienteId: z.string().optional(),
  motivo: z.enum([
    "DEFEITO_FABRICACAO",
    "PECA_ERRADA",
    "PECA_INCOMPATIVEL",
    "AVARIA_TRANSPORTE",
    "ARREPENDIMENTO",
    "EXCESSO_PEDIDO",
    "PRAZO_VALIDADE",
    "OUTROS",
  ]),
  quantidade: z.number().positive(),
  descricao: z.string().optional(),
  fotos: z.array(z.string()).optional(),
});
const autorizarSchema = z.object({ acao: z.literal("autorizar"), rmaId: z.string(), autorizadoPor: z.string().optional() });
const receberSchema = z.object({ acao: z.literal("receber"), rmaId: z.string(), inspecionadoPor: z.string().optional() });
const resolverSchema = z.object({
  acao: z.literal("resolver"),
  rmaId: z.string(),
  resolucao: z.enum(["REEMBOLSO", "TROCA_MESMO_PRODUTO", "TROCA_OUTRO_PRODUTO", "CREDITO_LOJA", "REPARO", "GARANTIA_FORNECEDOR", "RECUSADA"]),
  valorReembolso: z.number().optional(),
  novoItemVendaId: z.string().optional(),
  trocaGarantiaFornecedorId: z.string().optional(),
});

const schema = z.discriminatedUnion("acao", [abrirSchema, autorizarSchema, receberSchema, resolverSchema]);

export const POST = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const body = schema.parse(await req.json());
  if (body.acao === "abrir") {
    const out = await abrirRMA({ empresaId, ...body });
    return NextResponse.json(out, { status: 201 });
  }

  // Ações sobre um RMA existente: garante que pertence à empresa.
  const rma = await prisma.solicitacaoRMA.findFirst({
    where: { id: body.rmaId, empresaId },
    select: { id: true },
  });
  if (!rma) throw new ApiError(404, "RMA não encontrado");

  if (body.acao === "autorizar") {
    const out = await autorizarRMA(body.rmaId, body.autorizadoPor);
    return NextResponse.json(out);
  }
  if (body.acao === "receber") {
    const out = await registrarRecebimento(body.rmaId, body.inspecionadoPor);
    return NextResponse.json(out);
  }
  const out = await resolverRMA(body);
  return NextResponse.json(out);
});
