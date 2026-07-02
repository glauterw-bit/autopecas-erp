import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { criarOS, atualizarStatusOS, vincularPecasOS, faturarServicoOS } from "@/lib/os/ordem-servico";
import { comAuth, ApiError } from "@/lib/auth/guard";

const criarSchema = z.object({
  acao: z.literal("criar"),
  clienteId: z.string().optional(),
  veiculoClienteId: z.string().optional(),
  placa: z.string().optional(),
  kmEntrada: z.number().int().optional(),
  diagnostico: z.string().optional(),
  servicoExecutado: z.string().optional(),
  tecnicoId: z.string().optional(),
  garantiaServicoDias: z.number().int().optional(),
  itensServico: z.array(z.object({
    codigoServico: z.string(),
    descricao: z.string(),
    quantidade: z.number().positive(),
    valorUnitario: z.number().positive(),
    desconto: z.number().optional(),
    duracaoMinutos: z.number().int().optional(),
  })).optional(),
});
const statusSchema = z.object({
  acao: z.literal("atualizar-status"),
  ordemId: z.string(),
  status: z.enum(["ABERTA","EM_ANALISE","AGUARDANDO_APROVACAO","APROVADA","EM_EXECUCAO","AGUARDANDO_PECA","CONCLUIDA","ENTREGUE","CANCELADA","GARANTIA"]),
  kmSaida: z.number().int().optional(),
});
const vincSchema = z.object({ acao: z.literal("vincular-pecas"), ordemId: z.string(), vendaId: z.string() });
const fatSchema = z.object({ acao: z.literal("faturar-servico"), ordemId: z.string() });

const schema = z.discriminatedUnion("acao", [criarSchema, statusSchema, vincSchema, fatSchema]);

export const GET = comAuth("TECNICO", async (_req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const ordens = await prisma.ordemServico.findMany({
    where: { empresaId },
    include: { itensServico: true },
    orderBy: { abertaEm: "desc" },
    take: 100,
  });
  return NextResponse.json(ordens);
});

export const POST = comAuth("TECNICO", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const body = schema.parse(await req.json());
  if (body.acao === "criar") {
    const os = await criarOS({ empresaId, ...body });
    return NextResponse.json(os, { status: 201 });
  }

  // Ações sobre uma OS existente: garante que a ordem pertence à empresa.
  const ordem = await prisma.ordemServico.findFirst({
    where: { id: body.ordemId, empresaId },
    select: { id: true },
  });
  if (!ordem) throw new ApiError(404, "Ordem de serviço não encontrada");

  if (body.acao === "atualizar-status") return NextResponse.json(await atualizarStatusOS(body));
  if (body.acao === "vincular-pecas") {
    const venda = await prisma.venda.findFirst({
      where: { id: body.vendaId, empresaId },
      select: { id: true },
    });
    if (!venda) throw new ApiError(404, "Venda não encontrada");
    return NextResponse.json(await vincularPecasOS(body.ordemId, body.vendaId));
  }
  return NextResponse.json(await faturarServicoOS(body.ordemId));
});
