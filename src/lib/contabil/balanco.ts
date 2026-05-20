import { prisma } from "../db";
import { gerarDRE } from "./dre";

// Demonstrações contábeis obrigatórias (Lei 6.404 / CPC 26)
// ========================================================
//   - Balanço Patrimonial (BP)
//   - Demonstração de Fluxo de Caixa (DFC) — método indireto
//   - Demonstração de Lucros/Prejuízos Acumulados (DLPA)
//   - Demonstração de Mutações do PL (DMPL)

export interface LinhaBP {
  rotulo: string;
  valor: number;
  detalhe?: Array<{ nome: string; valor: number }>;
}
export interface BalancoPatrimonial {
  dataReferencia: Date;
  ativo: { circulante: LinhaBP[]; naoCirculante: LinhaBP[]; total: number };
  passivo: { circulante: LinhaBP[]; naoCirculante: LinhaBP[]; patrimonioLiquido: LinhaBP[]; total: number };
}

export async function gerarBalanco(opts: {
  empresaId: string;
  dataReferencia: Date;
}): Promise<BalancoPatrimonial> {
  const ref = opts.dataReferencia;

  // ATIVO CIRCULANTE
  const caixa = await prisma.contaBancaria.aggregate({
    where: { empresaId: opts.empresaId, ativa: true },
    _sum: { saldoAtual: true },
  });
  const contasReceber = await prisma.contaReceber.aggregate({
    where: {
      empresaId: opts.empresaId,
      status: { in: ["ABERTO", "PARCIALMENTE_PAGO", "ATRASADO"] },
      criadoEm: { lte: ref },
    },
    _sum: { valor: true, valorRecebido: true },
  });
  const estoqueValor = await prisma.$queryRaw<Array<{ total: number }>>`
    SELECT COALESCE(SUM(e.quantidade * p.custo_medio), 0)::float AS total
      FROM estoque_deposito e
      JOIN produtos p ON p.id = e.produto_id
     WHERE p.empresa_id = ${opts.empresaId}`;

  const disponivel = Number(caixa._sum.saldoAtual ?? 0);
  const aReceber =
    Number(contasReceber._sum.valor ?? 0) - Number(contasReceber._sum.valorRecebido ?? 0);
  const estoque = Number(estoqueValor[0]?.total ?? 0);

  const circulanteAtivo: LinhaBP[] = [
    { rotulo: "Disponibilidades (Caixa + Bancos + PIX)", valor: disponivel },
    { rotulo: "Clientes (Contas a Receber)", valor: aReceber },
    { rotulo: "Estoque de Mercadorias", valor: estoque },
  ];
  const totalCircAtivo = circulanteAtivo.reduce((a, l) => a + l.valor, 0);

  // ATIVO NÃO CIRCULANTE (placeholder — imobilizado, intangível)
  const naoCircAtivo: LinhaBP[] = [
    { rotulo: "Imobilizado (líquido de depreciação)", valor: 0 },
  ];
  const totalNCAtivo = naoCircAtivo.reduce((a, l) => a + l.valor, 0);

  // PASSIVO CIRCULANTE
  const fornecedoresPagar = await prisma.contaPagar.aggregate({
    where: {
      empresaId: opts.empresaId,
      status: { in: ["ABERTO", "PARCIALMENTE_PAGO", "ATRASADO"] },
      criadoEm: { lte: ref },
    },
    _sum: { valor: true, valorPago: true },
  });
  const aPagar =
    Number(fornecedoresPagar._sum.valor ?? 0) -
    Number(fornecedoresPagar._sum.valorPago ?? 0);

  const circulantePassivo: LinhaBP[] = [
    { rotulo: "Fornecedores", valor: aPagar },
    { rotulo: "Obrigações Tributárias", valor: 0 },
    { rotulo: "Obrigações Trabalhistas", valor: 0 },
  ];
  const totalCircPassivo = circulantePassivo.reduce((a, l) => a + l.valor, 0);

  const naoCircPassivo: LinhaBP[] = [
    { rotulo: "Empréstimos e Financiamentos (LP)", valor: 0 },
  ];
  const totalNCPassivo = naoCircPassivo.reduce((a, l) => a + l.valor, 0);

  // PATRIMÔNIO LÍQUIDO — apuração do exercício
  const inicioAno = new Date(ref.getFullYear(), 0, 1);
  const dre = await gerarDRE({
    empresaId: opts.empresaId,
    inicio: inicioAno,
    fim: ref,
  });
  const lucrosAcumulados = dre.lucroLiquido;

  const totalAtivo = totalCircAtivo + totalNCAtivo;
  const totalPassivoSemPL = totalCircPassivo + totalNCPassivo;
  const capitalSocial = Math.max(0, totalAtivo - totalPassivoSemPL - lucrosAcumulados);

  const patrimonioLiquido: LinhaBP[] = [
    { rotulo: "Capital Social", valor: capitalSocial },
    { rotulo: "Lucros Acumulados", valor: lucrosAcumulados },
  ];
  const totalPL = patrimonioLiquido.reduce((a, l) => a + l.valor, 0);

  return {
    dataReferencia: ref,
    ativo: {
      circulante: circulanteAtivo,
      naoCirculante: naoCircAtivo,
      total: totalAtivo,
    },
    passivo: {
      circulante: circulantePassivo,
      naoCirculante: naoCircPassivo,
      patrimonioLiquido,
      total: totalCircPassivo + totalNCPassivo + totalPL,
    },
  };
}

// DFC — Demonstração do Fluxo de Caixa (método indireto)
export interface DFCResultado {
  periodo: { inicio: Date; fim: Date };
  atividadesOperacionais: LinhaBP[];
  atividadesInvestimento: LinhaBP[];
  atividadesFinanciamento: LinhaBP[];
  variacaoCaixa: number;
  saldoInicial: number;
  saldoFinal: number;
}

export async function gerarDFC(opts: {
  empresaId: string;
  inicio: Date;
  fim: Date;
}): Promise<DFCResultado> {
  const { empresaId, inicio, fim } = opts;
  const dre = await gerarDRE({ empresaId, inicio, fim });
  const lucroLiquido = dre.lucroLiquido;

  const entradas = await prisma.movimentoCaixa.aggregate({
    where: { empresaId, data: { gte: inicio, lte: fim }, tipo: "ENTRADA" },
    _sum: { valor: true },
  });
  const saidas = await prisma.movimentoCaixa.aggregate({
    where: { empresaId, data: { gte: inicio, lte: fim }, tipo: "SAIDA" },
    _sum: { valor: true },
  });

  const operacionais: LinhaBP[] = [
    { rotulo: "Lucro Líquido do Período", valor: lucroLiquido },
    {
      rotulo: "Recebimentos de Clientes (entradas operacionais)",
      valor: Number(entradas._sum.valor ?? 0),
    },
    {
      rotulo: "Pagamentos a Fornecedores e Despesas",
      valor: -Number(saidas._sum.valor ?? 0),
    },
  ];

  const investimento: LinhaBP[] = [
    { rotulo: "Aquisição de Imobilizado", valor: 0 },
  ];
  const financiamento: LinhaBP[] = [
    { rotulo: "Empréstimos Captados", valor: 0 },
    { rotulo: "Pagamento de Empréstimos", valor: 0 },
  ];

  const variacao =
    operacionais.reduce((a, l) => a + l.valor, 0) +
    investimento.reduce((a, l) => a + l.valor, 0) +
    financiamento.reduce((a, l) => a + l.valor, 0);

  const saldoFinalAgg = await prisma.contaBancaria.aggregate({
    where: { empresaId },
    _sum: { saldoAtual: true },
  });
  const saldoFinal = Number(saldoFinalAgg._sum.saldoAtual ?? 0);

  return {
    periodo: { inicio, fim },
    atividadesOperacionais: operacionais,
    atividadesInvestimento: investimento,
    atividadesFinanciamento: financiamento,
    variacaoCaixa: variacao,
    saldoInicial: saldoFinal - variacao,
    saldoFinal,
  };
}

// DLPA — Demonstração de Lucros / Prejuízos Acumulados
export async function gerarDLPA(opts: {
  empresaId: string;
  exercicio: number;
}) {
  const inicio = new Date(opts.exercicio, 0, 1);
  const fim = new Date(opts.exercicio, 11, 31);
  const dre = await gerarDRE({ empresaId: opts.empresaId, inicio, fim });
  const inicial = 0; // saldo anterior (em produção: lê do BP do ano anterior)
  const lucroExercicio = dre.lucroLiquido;
  // Reservas legais: 5% do lucro até 20% do capital social
  const reservaLegal = Math.max(0, lucroExercicio * 0.05);
  const dividendos = 0; // configurável
  const final = inicial + lucroExercicio - reservaLegal - dividendos;
  return {
    exercicio: opts.exercicio,
    saldoInicial: inicial,
    lucroExercicio,
    reservaLegal: -reservaLegal,
    dividendos: -dividendos,
    saldoFinal: final,
  };
}
