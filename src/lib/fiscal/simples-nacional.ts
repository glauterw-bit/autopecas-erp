// Simples Nacional — PGDAS-D
// ==========================
// Apuração mensal das alíquotas efetivas do Simples Nacional para varejo
// (Anexo I da LC 123/2006). Em auto peças, a maioria fica no Anexo I (comércio).
// Serviços (oficina, instalação) podem cair no Anexo III.
//
// Fórmula oficial:
//   Alíquota Efetiva = ((RBT12 × Alíq. nominal) - Parcela a Deduzir) / RBT12
//
//   Onde:
//     RBT12 = receita bruta acumulada dos últimos 12 meses
//     Faixa = determinada pela RBT12
//     Alíq. nominal / PD = vêm da tabela do anexo

import { prisma } from "../db";

export type AnexoSimples = "I" | "II" | "III" | "IV" | "V";

interface FaixaSimples {
  ate: number;
  aliqNominal: number;
  pd: number; // parcela a deduzir
}

// Anexo I — Comércio (vigente desde 2018, sem ajuste pós-RTI)
const ANEXO_I: FaixaSimples[] = [
  { ate: 180_000,    aliqNominal: 4.0,  pd: 0 },
  { ate: 360_000,    aliqNominal: 7.3,  pd: 5_940 },
  { ate: 720_000,    aliqNominal: 9.5,  pd: 13_860 },
  { ate: 1_800_000,  aliqNominal: 10.7, pd: 22_500 },
  { ate: 3_600_000,  aliqNominal: 14.3, pd: 87_300 },
  { ate: 4_800_000,  aliqNominal: 19.0, pd: 378_000 },
];

// Anexo III — Serviços (oficina é geralmente aqui se for prestação)
const ANEXO_III: FaixaSimples[] = [
  { ate: 180_000,    aliqNominal: 6.0,  pd: 0 },
  { ate: 360_000,    aliqNominal: 11.2, pd: 9_360 },
  { ate: 720_000,    aliqNominal: 13.5, pd: 17_640 },
  { ate: 1_800_000,  aliqNominal: 16.0, pd: 35_640 },
  { ate: 3_600_000,  aliqNominal: 21.0, pd: 125_640 },
  { ate: 4_800_000,  aliqNominal: 33.0, pd: 648_000 },
];

const TABELAS: Record<AnexoSimples, FaixaSimples[]> = {
  I: ANEXO_I,
  II: ANEXO_I,    // industrial (não aplicado aqui)
  III: ANEXO_III,
  IV: ANEXO_III,  // serviços específicos
  V: ANEXO_III,   // serviços com fator R
};

// Repartição da alíquota efetiva entre tributos (Anexo I — comércio):
// IRPJ, CSLL, COFINS, PIS, CPP, ICMS
const REPARTICAO_ANEXO_I: Record<number, Record<string, number>> = {
  1: { IRPJ: 5.5,  CSLL: 3.5,  COFINS: 12.74, PIS: 2.76, CPP: 41.5, ICMS: 34.0 },
  2: { IRPJ: 5.5,  CSLL: 3.5,  COFINS: 12.74, PIS: 2.76, CPP: 41.5, ICMS: 34.0 },
  3: { IRPJ: 5.5,  CSLL: 3.5,  COFINS: 12.74, PIS: 2.76, CPP: 42.0, ICMS: 33.5 },
  4: { IRPJ: 5.5,  CSLL: 3.5,  COFINS: 12.74, PIS: 2.76, CPP: 42.0, ICMS: 33.5 },
  5: { IRPJ: 5.5,  CSLL: 3.5,  COFINS: 12.74, PIS: 2.76, CPP: 42.0, ICMS: 33.5 },
  6: { IRPJ: 13.5, CSLL: 10.0, COFINS: 28.27, PIS: 6.13, CPP: 42.1, ICMS: 0 },
};

export interface ApuracaoPgdas {
  competencia: string;          // YYYY-MM
  anexo: AnexoSimples;
  rbt12: number;
  receitaBrutaMes: number;
  faixa: number;
  aliqNominal: number;
  aliqEfetiva: number;
  valorDevido: number;
  reparticao: Record<string, number>;  // valor por tributo
  excedeuSublimite: boolean;     // RBT12 > R$ 3.6M (sublimite ICMS)
  excedeuLimite: boolean;        // RBT12 > R$ 4.8M (exclusão)
}

export async function apurarPGDAS(opts: {
  empresaId: string;
  competencia: Date; // qualquer dia do mês
  anexo?: AnexoSimples;
}): Promise<ApuracaoPgdas> {
  const anexo = opts.anexo ?? "I";
  const inicioCompetencia = new Date(opts.competencia.getFullYear(), opts.competencia.getMonth(), 1);
  const fimCompetencia = new Date(opts.competencia.getFullYear(), opts.competencia.getMonth() + 1, 0);

  // Receita do mês (competência atual)
  const receitaMes = await prisma.venda.aggregate({
    where: {
      empresaId: opts.empresaId,
      criadaEm: { gte: inicioCompetencia, lte: fimCompetencia },
      tipo: "VENDA",
      status: { not: "CANCELADA" },
    },
    _sum: { valorTotal: true },
  });

  // RBT12 — últimos 12 meses imediatamente anteriores à competência
  const inicio12 = new Date(inicioCompetencia);
  inicio12.setMonth(inicio12.getMonth() - 12);
  const fim12 = new Date(inicioCompetencia);
  fim12.setMilliseconds(-1);

  const receita12 = await prisma.venda.aggregate({
    where: {
      empresaId: opts.empresaId,
      criadaEm: { gte: inicio12, lte: fim12 },
      tipo: "VENDA",
      status: { not: "CANCELADA" },
    },
    _sum: { valorTotal: true },
  });

  const rbt12 = Number(receita12._sum.valorTotal ?? 0);
  const receitaBrutaMes = Number(receitaMes._sum.valorTotal ?? 0);

  // Determina a faixa pela RBT12
  const tabela = TABELAS[anexo];
  let faixaIdx = tabela.findIndex((f) => rbt12 <= f.ate);
  if (faixaIdx === -1) faixaIdx = tabela.length - 1;
  const faixa = tabela[faixaIdx];
  const numeroFaixa = faixaIdx + 1;

  // Alíquota efetiva
  const aliqEfetiva = rbt12 > 0
    ? ((rbt12 * faixa.aliqNominal / 100) - faixa.pd) / rbt12 * 100
    : faixa.aliqNominal;
  const aliqEfetivaSafe = Math.max(0, aliqEfetiva);

  // Valor devido no mês
  const valorDevido = (receitaBrutaMes * aliqEfetivaSafe) / 100;

  // Repartição entre tributos
  const rep = REPARTICAO_ANEXO_I[numeroFaixa] ?? REPARTICAO_ANEXO_I[1];
  const reparticao: Record<string, number> = {};
  for (const [tributo, pct] of Object.entries(rep)) {
    reparticao[tributo] = (valorDevido * pct) / 100;
  }

  return {
    competencia: `${opts.competencia.getFullYear()}-${String(opts.competencia.getMonth() + 1).padStart(2, "0")}`,
    anexo,
    rbt12,
    receitaBrutaMes,
    faixa: numeroFaixa,
    aliqNominal: faixa.aliqNominal,
    aliqEfetiva: aliqEfetivaSafe,
    valorDevido,
    reparticao,
    excedeuSublimite: rbt12 > 3_600_000,
    excedeuLimite: rbt12 > 4_800_000,
  };
}

// Geração da guia DAS (Documento de Arrecadação do Simples Nacional) — código
// de barras + linha digitável. O cálculo do código de barras segue padrão
// FEBRABAN (44 dígitos). Em produção, a integração oficial é via Portal
// e-CAC ou Receita; este helper monta o esqueleto.
export function montarDAS(apuracao: ApuracaoPgdas, cnpj: string, vencimento: Date) {
  return {
    cnpj,
    competencia: apuracao.competencia,
    valor: apuracao.valorDevido,
    vencimento,
    codigoBarras: "85800000000-0", // placeholder — gerar via Portal Receita
    linhaDigitavel: "—",            // idem
    detalhe: apuracao.reparticao,
  };
}
