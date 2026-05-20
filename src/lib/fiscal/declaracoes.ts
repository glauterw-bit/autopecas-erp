import { prisma } from "../db";
import { apurarPGDAS } from "./simples-nacional";

// Declarações fiscais federais
// =============================
// DCTF Web — Declaração de Débitos e Créditos Tributários Federais (sucedeu
//            DCTF/DCTFWeb a partir de 2018). Federa apuração mensal de IRPJ,
//            CSLL, PIS, COFINS, Contrib. Previdenciária para Lucro Presumido/Real.
// DEFIS    — Declaração de Informações Socioeconômicas e Fiscais (anual,
//            Simples Nacional). Conjunto de receitas, custos e despesas do ano.
// EFD-Reinf — Escrituração de Retenções e Outras Informações Fiscais
//            (Retenção de PIS/COFINS/CSLL, serviços prestados PJ etc.).

export interface DctfWebRegistro {
  competencia: string;        // YYYY-MM
  codigoReceita: string;      // 0220 (IRPJ), 2362 (CSLL), 8109 (PIS), 2172 (COFINS)
  descricao: string;
  valorDevido: number;
  valorPago?: number;
  vencimento: Date;
}

export async function gerarDctfWeb(opts: {
  empresaId: string;
  competencia: Date;
}): Promise<DctfWebRegistro[]> {
  const inicio = new Date(opts.competencia.getFullYear(), opts.competencia.getMonth(), 1);
  const fim = new Date(opts.competencia.getFullYear(), opts.competencia.getMonth() + 1, 0);
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: opts.empresaId } });
  const comp = `${opts.competencia.getFullYear()}-${String(opts.competencia.getMonth() + 1).padStart(2, "0")}`;
  const venc = new Date(opts.competencia.getFullYear(), opts.competencia.getMonth() + 1, 25);

  // Para Simples Nacional, DCTF Web é dispensada — usa-se PGDAS-D.
  if (empresa.regimeTributario === "SIMPLES_NACIONAL" || empresa.regimeTributario === "MEI") {
    return [];
  }

  // Lucro Presumido: presunção 8% para comércio + alíquotas
  const receitas = await prisma.venda.aggregate({
    where: {
      empresaId: opts.empresaId,
      criadaEm: { gte: inicio, lte: fim },
      tipo: "VENDA",
      status: { not: "CANCELADA" },
    },
    _sum: { valorTotal: true },
  });
  const receitaTotal = Number(receitas._sum.valorTotal ?? 0);
  const baseIrpj = receitaTotal * 0.08;
  const baseCsll = receitaTotal * 0.12;

  const aliqPis = empresa.regimeTributario === "LUCRO_REAL" ? 1.65 : 0.65;
  const aliqCofins = empresa.regimeTributario === "LUCRO_REAL" ? 7.6 : 3.0;
  const isReal = empresa.regimeTributario === "LUCRO_REAL";

  return [
    { competencia: comp, codigoReceita: "8109", descricao: "PIS",    valorDevido: receitaTotal * aliqPis / 100, vencimento: venc },
    { competencia: comp, codigoReceita: "2172", descricao: "COFINS", valorDevido: receitaTotal * aliqCofins / 100, vencimento: venc },
    {
      competencia: comp,
      codigoReceita: "0220",
      descricao: "IRPJ",
      valorDevido: isReal ? 0 : baseIrpj * 0.15, // 15% + adicional 10% se base > R$60k
      vencimento: venc,
    },
    {
      competencia: comp,
      codigoReceita: "2362",
      descricao: "CSLL",
      valorDevido: isReal ? 0 : baseCsll * 0.09,
      vencimento: venc,
    },
  ];
}

// DEFIS — anual (até 31/3 do ano subsequente)
export interface DefisResultado {
  exercicio: number;
  ganhoCapital: number;
  saldoCaixaInicio: number;
  saldoCaixaFim: number;
  estoqueInicio: number;
  estoqueFim: number;
  receitas: { mes: number; receitaBruta: number; aliqEfetiva: number; valorDevido: number }[];
  totalApurado: number;
}

export async function gerarDEFIS(opts: {
  empresaId: string;
  exercicio: number;
}): Promise<DefisResultado> {
  const receitas: DefisResultado["receitas"] = [];
  let totalApurado = 0;
  for (let m = 0; m < 12; m++) {
    const competencia = new Date(opts.exercicio, m, 1);
    const apur = await apurarPGDAS({ empresaId: opts.empresaId, competencia });
    receitas.push({
      mes: m + 1,
      receitaBruta: apur.receitaBrutaMes,
      aliqEfetiva: apur.aliqEfetiva,
      valorDevido: apur.valorDevido,
    });
    totalApurado += apur.valorDevido;
  }
  return {
    exercicio: opts.exercicio,
    ganhoCapital: 0,
    saldoCaixaInicio: 0,
    saldoCaixaFim: 0,
    estoqueInicio: 0,
    estoqueFim: 0,
    receitas,
    totalApurado,
  };
}

// EFD-Reinf — escrituração de retenções
export interface EfdReinfEvento {
  evento: "R-2010" | "R-2020" | "R-2030" | "R-2040" | "R-2098" | "R-2099";
  descricao: string;
  competencia: string;
  prestadorCnpj?: string;
  baseRetencao?: number;
  retencaoPisCofinsCsll?: number;
  retencaoIr?: number;
  retencaoInss?: number;
}

export async function gerarEfdReinf(opts: {
  empresaId: string;
  competencia: Date;
}): Promise<EfdReinfEvento[]> {
  const inicio = new Date(opts.competencia.getFullYear(), opts.competencia.getMonth(), 1);
  const fim = new Date(opts.competencia.getFullYear(), opts.competencia.getMonth() + 1, 0);
  const comp = `${opts.competencia.getFullYear()}-${String(opts.competencia.getMonth() + 1).padStart(2, "0")}`;

  // R-2010: Retenção PIS/COFINS/CSLL pagamento a PJ por serviços
  const honorarios = await prisma.contaPagar.findMany({
    where: {
      empresaId: opts.empresaId,
      dataPagamento: { gte: inicio, lte: fim },
      descricao: { contains: "honorário", mode: "insensitive" },
    },
    include: { fornecedor: true },
  });

  const eventos: EfdReinfEvento[] = honorarios.map((c) => ({
    evento: "R-2010",
    descricao: "Retenção PIS/COFINS/CSLL — serviços",
    competencia: comp,
    prestadorCnpj: c.fornecedor?.cnpjCpf,
    baseRetencao: Number(c.valorPago),
    retencaoPisCofinsCsll: Number(c.valorPago) * 0.0465, // 4.65%
  }));

  // R-2098 (reabertura) e R-2099 (fechamento) sempre incluídos
  eventos.push({
    evento: "R-2099",
    descricao: "Fechamento do movimento periódico",
    competencia: comp,
  });
  return eventos;
}
