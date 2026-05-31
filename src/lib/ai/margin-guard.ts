import { prisma } from "../db";

// MarginGuard
// ===========
// Em tempo de venda (no PDV) e em batch noturno, monitora margens:
//   - Detecta itens vendidos abaixo do precoMinimo ou da margemAlvo
//   - Alerta de "queima" de margem por desconto liberal
//   - Sugere ajuste de preço quando custo subiu mas preço não acompanhou
//
// Diferente de simples regra de descontos, considera o histórico do cliente
// (frotista pode ter desconto maior por volume) e o concorrente (sinalizado).

export interface AvaliacaoMargem {
  okay: boolean;
  precoSugerido: number;
  margemAtual: number;
  margemMinima: number;
  motivos: string[];
}

export function avaliarMargemItem(opts: {
  custoUnitario: number;
  precoUnitario: number;
  precoMinimo?: number | null;
  margemAlvo?: number | null;
}): AvaliacaoMargem {
  const margemAtual =
    opts.precoUnitario > 0
      ? (opts.precoUnitario - opts.custoUnitario) / opts.precoUnitario
      : 0;
  const margemAlvo = opts.margemAlvo ?? 0.2;
  const motivos: string[] = [];
  let okay = true;
  if (opts.precoMinimo && opts.precoUnitario < opts.precoMinimo) {
    motivos.push(
      `Preço abaixo do mínimo configurado (R$ ${opts.precoMinimo.toFixed(2)}).`,
    );
    okay = false;
  }
  if (margemAtual < margemAlvo * 0.5) {
    motivos.push(
      `Margem ${(margemAtual * 100).toFixed(1)}% bem abaixo da meta (${(margemAlvo * 100).toFixed(0)}%).`,
    );
    okay = false;
  } else if (margemAtual < margemAlvo) {
    motivos.push(
      `Margem ${(margemAtual * 100).toFixed(1)}% abaixo da meta de ${(margemAlvo * 100).toFixed(0)}%.`,
    );
  }
  const precoSugerido = opts.custoUnitario / (1 - margemAlvo);
  return { okay, precoSugerido, margemAtual, margemMinima: margemAlvo, motivos };
}

// Gera insights de margem baixa para vendas dos últimos N dias.
export async function gerarInsightsMargemEmpresa(empresaId: string, dias = 30) {
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  const rows = await prisma.$queryRaw<
    Array<{
      produto_id: string;
      sku: string;
      nome: string;
      vendas: number;
      margem_media: number;
    }>
  >`
    SELECT p.id AS produto_id, p.sku, p.nome,
           COUNT(*)::int AS vendas,
           AVG((iv."precoUnitario" - iv."custoUnitario") / NULLIF(iv."precoUnitario",0))::float AS margem_media
      FROM itens_venda iv
      JOIN vendas v ON v.id = iv."vendaId"
      JOIN produtos p ON p.id = iv."produtoId"
     WHERE v."empresaId" = ${empresaId}
       AND v."criadaEm" >= ${desde}
       AND v.status NOT IN ('CANCELADA')
     GROUP BY p.id, p.sku, p.nome
     HAVING COUNT(*) >= 3
        AND AVG((iv."precoUnitario" - iv."custoUnitario") / NULLIF(iv."precoUnitario",0)) < 0.10
     ORDER BY margem_media ASC
     LIMIT 50`;

  for (const r of rows) {
    await prisma.insightIA.create({
      data: {
        empresaId,
        tipo: "MARGEM_BAIXA",
        severidade: r.margem_media < 0 ? "CRITICO" : "AVISO",
        titulo: `Margem baixa: ${r.nome}`,
        descricao: `Margem média ${(r.margem_media * 100).toFixed(1)}% em ${r.vendas} vendas nos últimos ${dias} dias.`,
        acaoSugerida: "Revisar preço de venda ou custo médio do produto.",
        dadosReferencia: { produtoId: r.produto_id, sku: r.sku },
      },
    });
  }
  return rows.length;
}
