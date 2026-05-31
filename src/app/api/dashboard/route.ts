import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { empresaAtualId } from "@/lib/sessao";

export async function GET() {
  const empresaId = await empresaAtualId();
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);

  const [
    vendasHoje,
    vendasMes,
    totalProdutos,
    totalClientes,
    receberAbertas,
    pagarAbertas,
    insightsCriticos,
    topProdutos,
    vendasPorDia,
  ] = await Promise.all([
    prisma.venda.aggregate({
      where: { empresaId, criadaEm: { gte: inicioHoje }, status: { not: "CANCELADA" } },
      _sum: { valorTotal: true, margemBruta: true },
      _count: { _all: true },
    }),
    prisma.venda.aggregate({
      where: { empresaId, criadaEm: { gte: inicioMes }, status: { not: "CANCELADA" } },
      _sum: { valorTotal: true, margemBruta: true },
      _count: { _all: true },
    }),
    prisma.produto.count({ where: { empresaId, ativo: true } }),
    prisma.cliente.count({ where: { empresaId } }),
    prisma.contaReceber.aggregate({
      where: { empresaId, status: { in: ["ABERTO", "PARCIALMENTE_PAGO", "ATRASADO"] } },
      _sum: { valor: true, valorRecebido: true },
      _count: { _all: true },
    }),
    prisma.contaPagar.aggregate({
      where: { empresaId, status: { in: ["ABERTO", "PARCIALMENTE_PAGO", "ATRASADO"] } },
      _sum: { valor: true, valorPago: true },
      _count: { _all: true },
    }),
    prisma.insightIA.findMany({
      where: { empresaId, severidade: "CRITICO", resolvidoEm: null },
      take: 5,
      orderBy: { criadoEm: "desc" },
    }),
    prisma.$queryRaw<Array<{ nome: string; qtd: number; valor: number }>>`
      SELECT p.nome, SUM(iv.quantidade)::float AS qtd, SUM(iv.total)::float AS valor
        FROM itens_venda iv
        JOIN vendas v ON v.id = iv."vendaId"
        JOIN produtos p ON p.id = iv."produtoId"
       WHERE v."empresaId" = ${empresaId}
         AND v."criadaEm" >= ${inicioMes}
         AND v.status NOT IN ('CANCELADA')
       GROUP BY p.id, p.nome
       ORDER BY valor DESC
       LIMIT 10`,
    prisma.$queryRaw<Array<{ dia: Date; total: number }>>`
      SELECT DATE_TRUNC('day', "criadaEm") AS dia, SUM("valorTotal")::float AS total
        FROM vendas
       WHERE "empresaId" = ${empresaId}
         AND "criadaEm" >= ${inicioMes}
         AND status NOT IN ('CANCELADA')
       GROUP BY 1
       ORDER BY 1`,
  ]);

  return NextResponse.json({
    vendasHoje: {
      total: Number(vendasHoje._sum.valorTotal ?? 0),
      margem: Number(vendasHoje._sum.margemBruta ?? 0),
      quantidade: vendasHoje._count._all,
    },
    vendasMes: {
      total: Number(vendasMes._sum.valorTotal ?? 0),
      margem: Number(vendasMes._sum.margemBruta ?? 0),
      quantidade: vendasMes._count._all,
    },
    totalProdutos,
    totalClientes,
    receber: {
      total: Number(receberAbertas._sum.valor ?? 0) - Number(receberAbertas._sum.valorRecebido ?? 0),
      quantidade: receberAbertas._count._all,
    },
    pagar: {
      total: Number(pagarAbertas._sum.valor ?? 0) - Number(pagarAbertas._sum.valorPago ?? 0),
      quantidade: pagarAbertas._count._all,
    },
    insightsCriticos,
    topProdutos,
    vendasPorDia,
  });
}
