import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";

// Motor de sugestão de compra
// ===========================
// GET (ESTOQUISTA): monta a sugestão agrupada por fornecedor.
//   - candidato: estoqueTotal <= max(pontoReposicao ?? estoqueMinimo, 0)
//     OU teve venda perdida SEM_ESTOQUE nos últimos 30 dias;
//   - sugerida: max(estoqueMaximo − estoqueTotal, demandaPerdida30d,
//     qtdMinima do fornecedor escolhido, 1);
//   - fornecedor: preferencial da grade, senão o de menor precoCompra;
//     sem grade → grupo "semFornecedor".
// POST (GERENTE): transforma um grupo em PedidoCompra RASCUNHO.

type ProdutoResumo = { id: string; sku: string; nome: string };
type ItemSugestao = {
  produto: ProdutoResumo;
  estoqueTotal: number;
  sugerida: number;
  precoCompra: number;
  subtotal: number;
};
type GrupoFornecedor = {
  fornecedor: { id: string; nome: string; prazoEntregaDias: number };
  itens: ItemSugestao[];
  total: number;
};

const arred2 = (n: number) => Math.round(n * 100) / 100;

export const GET = comAuth("ESTOQUISTA", async (_req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [produtos, perdidas] = await Promise.all([
    prisma.produto.findMany({
      where: { empresaId, ativo: true },
      select: {
        id: true,
        sku: true,
        nome: true,
        estoqueMinimo: true,
        estoqueMaximo: true,
        pontoReposicao: true,
        estoques: { select: { quantidade: true } },
        fornecedoresGrade: {
          // Fornecedor inativo não recebe pedido — fora da grade.
          where: { fornecedor: { ativo: true } },
          select: {
            fornecedorId: true,
            precoCompra: true,
            qtdMinima: true,
            prazoEntregaDias: true,
            preferencial: true,
            fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
          },
        },
      },
    }),
    prisma.vendaPerdida.groupBy({
      by: ["produtoId"],
      where: {
        empresaId,
        motivo: "SEM_ESTOQUE",
        criadoEm: { gte: desde },
        produtoId: { not: null },
      },
      _sum: { quantidade: true },
    }),
  ]);

  const demandaPerdida = new Map<string, number>();
  for (const p of perdidas) {
    if (p.produtoId) demandaPerdida.set(p.produtoId, Number(p._sum.quantidade ?? 0));
  }

  const grupos = new Map<string, GrupoFornecedor>();
  const semFornecedor: Array<Omit<ItemSugestao, "precoCompra" | "subtotal">> = [];

  for (const p of produtos) {
    const estoqueTotal = p.estoques.reduce((s, e) => s + Number(e.quantidade), 0);
    const limiteReposicao = Math.max(Number(p.pontoReposicao ?? p.estoqueMinimo), 0);
    const perdida30d = demandaPerdida.get(p.id) ?? 0;

    // Sem parâmetro de reposição e sem demanda perdida, produto zerado não é
    // candidato — senão a sugestão lista 1un de todo o catálogo sem estoque.
    const temParametro =
      Number(p.estoqueMinimo) > 0 || p.pontoReposicao != null || perdida30d > 0;
    const candidato = temParametro && (estoqueTotal <= limiteReposicao || perdida30d > 0);
    if (!candidato) continue;

    const escolhido =
      p.fornecedoresGrade.find((g) => g.preferencial) ??
      [...p.fornecedoresGrade].sort(
        (a, b) => Number(a.precoCompra) - Number(b.precoCompra),
      )[0];

    const faltaAteMaximo =
      p.estoqueMaximo !== null ? Number(p.estoqueMaximo) - estoqueTotal : 0;
    const qtdMinima = escolhido ? Number(escolhido.qtdMinima) : 0;
    const sugerida = Math.ceil(Math.max(faltaAteMaximo, perdida30d, qtdMinima, 1));

    const produto: ProdutoResumo = { id: p.id, sku: p.sku, nome: p.nome };

    if (!escolhido) {
      semFornecedor.push({ produto, estoqueTotal, sugerida });
      continue;
    }

    const precoCompra = Number(escolhido.precoCompra);
    const subtotal = arred2(sugerida * precoCompra);

    let grupo = grupos.get(escolhido.fornecedorId);
    if (!grupo) {
      grupo = {
        fornecedor: {
          id: escolhido.fornecedor.id,
          nome: escolhido.fornecedor.nomeFantasia ?? escolhido.fornecedor.razaoSocial,
          prazoEntregaDias: escolhido.prazoEntregaDias,
        },
        itens: [],
        total: 0,
      };
      grupos.set(escolhido.fornecedorId, grupo);
    }
    grupo.itens.push({ produto, estoqueTotal, sugerida, precoCompra, subtotal });
    grupo.total = arred2(grupo.total + subtotal);
  }

  const listaGrupos = [...grupos.values()].sort((a, b) =>
    a.fornecedor.nome.localeCompare(b.fornecedor.nome),
  );

  return NextResponse.json({
    grupos: listaGrupos,
    semFornecedor: { itens: semFornecedor },
    geradoEm: new Date().toISOString(),
  });
});

const postSchema = z.object({
  fornecedorId: z.string().min(1),
  itens: z
    .array(
      z.object({
        produtoId: z.string().min(1),
        quantidade: z.number().positive(),
        precoUnitario: z.number().nonnegative(),
      }),
    )
    .min(1, "Informe ao menos um item"),
});

export const POST = comAuth("GERENTE", async (req, _ctx, usuario) => {
  const body = postSchema.parse(await req.json());
  const empresaId = usuario.empresaId;

  const fornecedor = await prisma.fornecedor.findFirst({
    where: { id: body.fornecedorId, empresaId },
    select: { id: true },
  });
  if (!fornecedor) throw new ApiError(404, "Fornecedor não encontrado");

  const idsProdutos = [...new Set(body.itens.map((i) => i.produtoId))];
  const validos = await prisma.produto.count({
    where: { id: { in: idsProdutos }, empresaId },
  });
  if (validos !== idsProdutos.length) {
    throw new ApiError(400, "Um ou mais produtos não pertencem à empresa");
  }

  const valorBruto = arred2(
    body.itens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0),
  );

  // Corrida do `numero` (dois pedidos lendo o mesmo máximo): P2002 no unique
  // (empresaId, numero) → até 3 tentativas com número relido.
  let pedido: {
    id: string;
    numero: number;
    status: string;
    valorTotal: Prisma.Decimal;
    itens: { id: string }[];
  } | null = null;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      pedido = await prisma.$transaction(async (tx) => {
        const max = await tx.pedidoCompra.aggregate({
          where: { empresaId },
          _max: { numero: true },
        });
        const numero = (max._max.numero ?? 0) + 1;
        return tx.pedidoCompra.create({
          data: {
            empresaId,
            fornecedorId: body.fornecedorId,
            numero,
            status: "RASCUNHO",
            valorBruto,
            valorTotal: valorBruto,
            observacoes: "Gerado pela sugestão de compra",
            itens: {
              create: body.itens.map((i) => ({
                produtoId: i.produtoId,
                quantidade: i.quantidade,
                custoUnitario: i.precoUnitario,
                total: arred2(i.quantidade * i.precoUnitario),
              })),
            },
          },
          select: {
            id: true,
            numero: true,
            status: true,
            valorTotal: true,
            itens: { select: { id: true } },
          },
        });
      });
      break;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002" &&
        JSON.stringify(e.meta?.target ?? "").includes("numero") &&
        tentativa < 3
      ) {
        continue;
      }
      throw e;
    }
  }
  if (!pedido) {
    throw new ApiError(409, "Não foi possível gerar o número do pedido — tente novamente");
  }

  return NextResponse.json(
    {
      id: pedido.id,
      numero: pedido.numero,
      status: pedido.status,
      valorTotal: Number(pedido.valorTotal),
      itens: pedido.itens.length,
    },
    { status: 201 },
  );
});
