import { prisma } from "@/lib/db";

// Promoções automáticas no PDV
// ============================
// Dado o conjunto de produtos de uma venda, resolve o preço promocional
// vigente por produto (Promocao ativa, dataInicio <= agora <= dataFim,
// com ItemPromocao do produto). Suporta DESCONTO_PERCENT, DESCONTO_VALOR
// e PRECO_FIXO — sempre calculado sobre o precoVenda cadastrado do produto.
// Se houver mais de uma promoção vigente, vence a de menor preço.

export type TipoPromocaoAplicavel = "DESCONTO_PERCENT" | "DESCONTO_VALOR" | "PRECO_FIXO";

export interface PromocaoVigente {
  produtoId: string;
  promocaoId: string;
  promocaoNome: string;
  tipo: TipoPromocaoAplicavel;
  precoPromocional: number;
}

export async function promocoesVigentes(
  empresaId: string,
  produtoIds: string[],
): Promise<Map<string, PromocaoVigente>> {
  const melhor = new Map<string, PromocaoVigente>();
  if (produtoIds.length === 0) return melhor;

  const agora = new Date();
  const itens = await prisma.itemPromocao.findMany({
    where: {
      produtoId: { in: produtoIds },
      produto: { empresaId },
      promocao: {
        ativa: true,
        dataInicio: { lte: agora },
        dataFim: { gte: agora },
        tipo: { in: ["DESCONTO_PERCENT", "DESCONTO_VALOR", "PRECO_FIXO"] },
      },
    },
    include: {
      promocao: { select: { id: true, nome: true, tipo: true, valorRegra: true } },
      produto: { select: { precoVenda: true } },
    },
  });

  for (const item of itens) {
    const base = Number(item.produto.precoVenda);
    const regra = Number(item.promocao.valorRegra ?? 0);
    let preco: number | null = null;
    switch (item.promocao.tipo) {
      case "DESCONTO_PERCENT": {
        // valorRegra pode estar como fração (0.10) ou pontos percentuais (10).
        const fracao = regra > 1 ? regra / 100 : regra;
        if (fracao > 0 && fracao < 1) preco = base * (1 - fracao);
        break;
      }
      case "DESCONTO_VALOR":
        if (regra > 0) preco = base - regra;
        break;
      case "PRECO_FIXO":
        if (regra > 0) preco = regra;
        break;
      default:
        preco = null;
    }
    if (preco === null || !Number.isFinite(preco)) continue;
    preco = Math.max(0, Number(preco.toFixed(2)));

    const atual = melhor.get(item.produtoId);
    if (!atual || preco < atual.precoPromocional) {
      melhor.set(item.produtoId, {
        produtoId: item.produtoId,
        promocaoId: item.promocao.id,
        promocaoNome: item.promocao.nome,
        tipo: item.promocao.tipo as TipoPromocaoAplicavel,
        precoPromocional: preco,
      });
    }
  }
  return melhor;
}
