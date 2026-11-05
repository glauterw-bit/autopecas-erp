import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { dec, formatarCentavos, paraCentavos, type ValorDinheiro } from "./dinheiro";

// MarginGuard
// ===========
// Em tempo de venda (no PDV) e em batch noturno, monitora margens:
//   - Detecta itens vendidos abaixo do precoMinimo ou da margemAlvo
//   - Sugere ajuste de preço quando custo subiu mas preço não acompanhou
//
// Regra 100% determinística (não usa modelo de linguagem). Dinheiro em
// Decimal/centavos; só a margem (uma razão) é número comum.

const D = Prisma.Decimal;
const MARGEM_ALVO_PADRAO = "0.2";

export interface AvaliacaoMargem {
  okay: boolean;
  /** Preço que atinge a margem-alvo, em reais com 2 casas (derivado de precoSugeridoCentavos). */
  precoSugerido: number;
  precoSugeridoCentavos: number;
  margemAtual: number;
  margemMinima: number;
  motivos: string[];
}

function pct(r: Prisma.Decimal, casas: number) {
  return r.mul(100).toFixed(casas).replace(".", ",");
}

export function avaliarMargemItem(opts: {
  custoUnitario: ValorDinheiro;
  precoUnitario: ValorDinheiro;
  precoMinimo?: ValorDinheiro | null;
  margemAlvo?: ValorDinheiro | null;
}): AvaliacaoMargem {
  const custo = dec(opts.custoUnitario);
  const preco = dec(opts.precoUnitario);
  let alvo = opts.margemAlvo !== null && opts.margemAlvo !== undefined ? dec(opts.margemAlvo) : new D(MARGEM_ALVO_PADRAO);
  // margemAlvo é fração (0.35 = 35%). Fora de [0, 1) não dá para calcular preço: usa o padrão.
  if (alvo.lt(0) || alvo.gte(1)) alvo = new D(MARGEM_ALVO_PADRAO);

  const margem = preco.gt(0) ? preco.sub(custo).div(preco) : new D(0);
  const motivos: string[] = [];
  let okay = true;

  if (opts.precoMinimo !== null && opts.precoMinimo !== undefined) {
    const minimoC = paraCentavos(opts.precoMinimo);
    if (minimoC > 0 && paraCentavos(preco) < minimoC) {
      motivos.push(`Preço abaixo do mínimo configurado (${formatarCentavos(minimoC)}).`);
      okay = false;
    }
  }
  if (margem.lt(alvo.mul("0.5"))) {
    motivos.push(`Margem ${pct(margem, 1)}% bem abaixo da meta (${pct(alvo, 0)}%).`);
    okay = false;
  } else if (margem.lt(alvo)) {
    motivos.push(`Margem ${pct(margem, 1)}% abaixo da meta de ${pct(alvo, 0)}%.`);
  }

  // Arredonda para cima: o preço sugerido nunca fica abaixo da meta por causa de centavo.
  const precoSugeridoCentavos = custo
    .mul(100)
    .div(new D(1).sub(alvo))
    .toDecimalPlaces(0, D.ROUND_UP)
    .toNumber();

  return {
    okay,
    precoSugerido: precoSugeridoCentavos / 100,
    precoSugeridoCentavos,
    margemAtual: margem.toDecimalPlaces(4).toNumber(),
    margemMinima: alvo.toNumber(),
    motivos,
  };
}

// Gera insights de margem baixa para vendas dos últimos N dias.
// Só conta venda concluída (tipo VENDA, status PAGA/FATURADA), não orçamento.
// Margem ponderada pelo valor: (Σ total − Σ custo×qtd) / Σ total, em numeric no banco.
export async function gerarInsightsMargemEmpresa(empresaId: string, dias = 30) {
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  const rows = await prisma.$queryRaw<
    Array<{
      produto_id: string;
      sku: string;
      nome: string;
      vendas: number;
      margem: Prisma.Decimal;
    }>
  >`
    SELECT p.id AS produto_id, p.sku, p.nome,
           COUNT(*)::int AS vendas,
           ((SUM(iv.total) - SUM(iv."custoUnitario" * iv.quantidade)) / NULLIF(SUM(iv.total), 0))::numeric(10,4) AS margem
      FROM itens_venda iv
      JOIN vendas v ON v.id = iv."vendaId"
      JOIN produtos p ON p.id = iv."produtoId"
     WHERE v."empresaId" = ${empresaId}
       AND p."empresaId" = ${empresaId}
       AND v."criadaEm" >= ${desde}
       AND v.tipo = 'VENDA'
       AND v.status IN ('PAGA', 'FATURADA')
     GROUP BY p.id, p.sku, p.nome
    HAVING COUNT(*) >= 3
       AND SUM(iv.total) > 0
       AND (SUM(iv.total) - SUM(iv."custoUnitario" * iv.quantidade)) / SUM(iv.total) < 0.10
     ORDER BY margem ASC
     LIMIT 50`;

  let criados = 0;
  for (const r of rows) {
    // Idempotente: não repete alerta enquanto o anterior do mesmo produto estiver aberto.
    const aberto = await prisma.insightIA.findFirst({
      where: {
        empresaId,
        tipo: "MARGEM_BAIXA",
        resolvidoEm: null,
        dadosReferencia: { path: ["produtoId"], equals: r.produto_id },
      },
      select: { id: true },
    });
    if (aberto) continue;
    const margem = dec(r.margem);
    await prisma.insightIA.create({
      data: {
        empresaId,
        tipo: "MARGEM_BAIXA",
        severidade: margem.lt(0) ? "CRITICO" : "AVISO",
        titulo: `Margem baixa: ${r.nome}`,
        descricao: `Margem de ${pct(margem, 1)}% em ${r.vendas} vendas nos últimos ${dias} dias.`,
        acaoSugerida: "Revisar preço de venda ou custo médio do produto.",
        dadosReferencia: { produtoId: r.produto_id, sku: r.sku },
      },
    });
    criados++;
  }
  return criados;
}
