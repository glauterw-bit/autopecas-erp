import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { criarOS, atualizarStatusOS, vincularPecasOS, faturarServicoOS } from "@/lib/os/ordem-servico";
import { empresaAtualId } from "@/lib/sessao";

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

export async function GET() {
  const empresaId = await empresaAtualId();
  const ordens = await prisma.ordemServico.findMany({
    where: { empresaId },
    include: { itensServico: true },
    orderBy: { abertaEm: "desc" },
    take: 100,
  });
  return NextResponse.json(ordens);
}

export async function POST(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const body = schema.parse(await req.json());
  try {
    if (body.acao === "criar") {
      const os = await criarOS({ empresaId, ...body });
      return NextResponse.json(os, { status: 201 });
    }
    if (body.acao === "atualizar-status") return NextResponse.json(await atualizarStatusOS(body));
    if (body.acao === "vincular-pecas") return NextResponse.json(await vincularPecasOS(body.ordemId, body.vendaId));
    return NextResponse.json(await faturarServicoOS(body.ordemId));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 });
  }
}
