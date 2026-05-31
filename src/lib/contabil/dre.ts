import { prisma } from "../db";

// DRE — Demonstração do Resultado do Exercício
// ============================================
// Apura, a partir dos lançamentos do período, o resultado contábil seguindo
// a estrutura padronizada (CPC 26 / Lei 6.404):
//
//   (=) Receita Operacional Bruta
//   (-) Deduções (devoluções, impostos sobre venda, comissões)
//   (=) Receita Líquida
//   (-) CMV
//   (=) Lucro Bruto
//   (-) Despesas Operacionais
//   (+/-) Resultado Financeiro
//   (=) Resultado antes do IR/CSLL
//   (-) IRPJ + CSLL
//   (=) Lucro Líquido

export interface DREItem {
  rotulo: string;
  valor: number;
  detalhe?: Array<{ nome: string; valor: number }>;
}

export interface DREResultado {
  periodo: { inicio: Date; fim: Date };
  itens: DREItem[];
  lucroLiquido: number;
  margemBrutaPercent: number;
  margemLiquidaPercent: number;
}

export async function gerarDRE(opts: {
  empresaId: string;
  inicio: Date;
  fim: Date;
}): Promise<DREResultado> {
  const { empresaId, inicio, fim } = opts;

  // 1. Receita bruta = soma de valor_total das vendas não canceladas, separada
  //    em vendas balcão (PDV/BALCAO) vs marketplaces vs serviços.
  const receitaBruta = await prisma.$queryRaw<
    Array<{ origem: string; total: number }>
  >`
    SELECT origem, SUM("valorTotal")::float AS total
      FROM vendas
     WHERE "empresaId" = ${empresaId}
       AND "criadaEm" BETWEEN ${inicio} AND ${fim}
       AND status NOT IN ('CANCELADA')
     GROUP BY origem`;

  const totalBruto = receitaBruta.reduce((a, r) => a + Number(r.total), 0);
  const vendasBalcao = receitaBruta
    .filter((r) => ["BALCAO", "PDV"].includes(r.origem))
    .reduce((a, r) => a + Number(r.total), 0);
  const vendasMarketplace = receitaBruta
    .filter((r) => r.origem.startsWith("MARKETPLACE"))
    .reduce((a, r) => a + Number(r.total), 0);
  const vendasEcommerce = receitaBruta
    .filter((r) => ["ECOMMERCE", "WHATSAPP", "TELEFONE"].includes(r.origem))
    .reduce((a, r) => a + Number(r.total), 0);

  // 2. Devoluções (vendas tipo DEVOLUCAO)
  const devolucoes = await prisma.venda.aggregate({
    where: {
      empresaId,
      criadaEm: { gte: inicio, lte: fim },
      tipo: "DEVOLUCAO",
      status: { not: "CANCELADA" },
    },
    _sum: { valorTotal: true },
  });

  // 3. Impostos sobre venda = soma valor_icms + valor_pis + valor_cofins das NFs
  const impostos = await prisma.notaFiscal.aggregate({
    where: { empresaId, dataEmissao: { gte: inicio, lte: fim }, status: "AUTORIZADA" },
    _sum: { valorIcms: true, valorPis: true, valorCofins: true, valorIpi: true },
  });
  const totalImpostos =
    Number(impostos._sum.valorIcms ?? 0) +
    Number(impostos._sum.valorPis ?? 0) +
    Number(impostos._sum.valorCofins ?? 0) +
    Number(impostos._sum.valorIpi ?? 0);

  // 4. Comissões marketplace (do payload de pedidos)
  const comissoes = await prisma.marketplacePedido.aggregate({
    where: { conta: { empresaId }, dataPedido: { gte: inicio, lte: fim } },
    _sum: { feeMarketplace: true },
  });

  // 5. CMV = sum(custo_total das vendas)
  const cmv = await prisma.venda.aggregate({
    where: {
      empresaId,
      criadaEm: { gte: inicio, lte: fim },
      tipo: "VENDA",
      status: { not: "CANCELADA" },
    },
    _sum: { custoTotal: true },
  });

  // 6. Despesas operacionais = contas a pagar com plano de contas tipo DESPESA
  const despesasPorPlano = await prisma.contaPagar.findMany({
    where: {
      empresaId,
      dataPagamento: { gte: inicio, lte: fim },
      planoConta: { tipo: "DESPESA" },
    },
    include: { planoConta: true },
  });
  const totalDespesas = despesasPorPlano.reduce(
    (a, c) => a + Number(c.valorPago),
    0,
  );
  const detalheDespesas = Object.entries(
    despesasPorPlano.reduce<Record<string, number>>((acc, c) => {
      const nome = c.planoConta?.nome ?? "Outras";
      acc[nome] = (acc[nome] ?? 0) + Number(c.valorPago);
      return acc;
    }, {}),
  ).map(([nome, valor]) => ({ nome, valor }));

  // 7. Resultado financeiro
  const receitaFinanceira = 0; // futuras: aplicações, juros recebidos
  const despesaFinanceira = 0; // futuras: tarifas, juros pagos

  // Cálculos finais
  const receitaLiquida =
    totalBruto - Number(devolucoes._sum.valorTotal ?? 0) - totalImpostos - Number(comissoes._sum.feeMarketplace ?? 0);
  const lucroBruto = receitaLiquida - Number(cmv._sum.custoTotal ?? 0);
  const lajir = lucroBruto - totalDespesas;
  const resultadoAntesIr = lajir + receitaFinanceira - despesaFinanceira;
  // IRPJ Lucro Presumido auto peças: presunção 8% → 15% IRPJ + 9% CSLL
  const irpj = Math.max(0, resultadoAntesIr * 0.08 * 0.15);
  const csll = Math.max(0, resultadoAntesIr * 0.12 * 0.09);
  const lucroLiquido = resultadoAntesIr - irpj - csll;

  const itens: DREItem[] = [
    {
      rotulo: "Receita Operacional Bruta",
      valor: totalBruto,
      detalhe: [
        { nome: "Vendas Balcão / PDV", valor: vendasBalcao },
        { nome: "Vendas Marketplaces", valor: vendasMarketplace },
        { nome: "Vendas E-commerce / WhatsApp / Telefone", valor: vendasEcommerce },
      ],
    },
    {
      rotulo: "(-) Deduções da Receita",
      valor: -(Number(devolucoes._sum.valorTotal ?? 0) + totalImpostos + Number(comissoes._sum.feeMarketplace ?? 0)),
      detalhe: [
        { nome: "Devoluções", valor: Number(devolucoes._sum.valorTotal ?? 0) },
        { nome: "Impostos s/ Venda (ICMS/PIS/COFINS/IPI)", valor: totalImpostos },
        { nome: "Comissões Marketplace", valor: Number(comissoes._sum.feeMarketplace ?? 0) },
      ],
    },
    { rotulo: "(=) Receita Líquida", valor: receitaLiquida },
    { rotulo: "(-) CMV", valor: -Number(cmv._sum.custoTotal ?? 0) },
    { rotulo: "(=) Lucro Bruto", valor: lucroBruto },
    { rotulo: "(-) Despesas Operacionais", valor: -totalDespesas, detalhe: detalheDespesas },
    { rotulo: "(=) LAJIR", valor: lajir },
    { rotulo: "(+/-) Resultado Financeiro", valor: receitaFinanceira - despesaFinanceira },
    { rotulo: "(=) Resultado antes do IR", valor: resultadoAntesIr },
    { rotulo: "(-) IRPJ", valor: -irpj },
    { rotulo: "(-) CSLL", valor: -csll },
    { rotulo: "(=) Lucro Líquido do Período", valor: lucroLiquido },
  ];

  return {
    periodo: { inicio, fim },
    itens,
    lucroLiquido,
    margemBrutaPercent: totalBruto > 0 ? (lucroBruto / totalBruto) * 100 : 0,
    margemLiquidaPercent: totalBruto > 0 ? (lucroLiquido / totalBruto) * 100 : 0,
  };
}

// Livro Razão por conta (extrato de uma conta contábil no período).
export async function livroRazao(opts: {
  empresaId: string;
  planoContaId: string;
  inicio: Date;
  fim: Date;
}) {
  const movimentos = await prisma.movimentoCaixa.findMany({
    where: {
      empresaId: opts.empresaId,
      planoContaId: opts.planoContaId,
      data: { gte: opts.inicio, lte: opts.fim },
    },
    orderBy: { data: "asc" },
  });
  let saldo = 0;
  return movimentos.map((m) => {
    saldo += m.tipo === "ENTRADA" ? Number(m.valor) : -Number(m.valor);
    return {
      data: m.data,
      descricao: m.descricao,
      debito: m.tipo === "ENTRADA" ? 0 : Number(m.valor),
      credito: m.tipo === "ENTRADA" ? Number(m.valor) : 0,
      saldo,
    };
  });
}
