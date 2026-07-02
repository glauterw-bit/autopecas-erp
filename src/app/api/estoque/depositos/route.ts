import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { comAuth } from "@/lib/auth/guard";

// GET /api/estoque/depositos — depósitos da empresa com contagem de SKUs
// e valor total de estoque (quantidade × custoMedio do produto).

export const GET = comAuth("ESTOQUISTA", async (_req, _ctx, usuario) => {
  const depositos = await prisma.deposito.findMany({
    where: { empresaId: usuario.empresaId },
    orderBy: { nome: "asc" },
    include: {
      estoques: {
        select: {
          quantidade: true,
          produto: { select: { custoMedio: true } },
        },
      },
    },
  });

  const resposta = depositos.map((d) => {
    let valorTotal = 0;
    for (const e of d.estoques) {
      valorTotal += Number(e.quantidade) * Number(e.produto.custoMedio);
    }
    return {
      id: d.id,
      nome: d.nome,
      tipo: d.tipo,
      ativo: d.ativo,
      permiteVenda: d.permiteVenda,
      skus: d.estoques.length,
      valorTotal: Number(valorTotal.toFixed(2)),
    };
  });

  return NextResponse.json(resposta);
});
