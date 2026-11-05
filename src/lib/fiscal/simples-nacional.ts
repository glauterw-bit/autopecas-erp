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
import { ratear, reaisParaCentavos } from "./centavos";
import { CSTS_ST_SUBSTITUIDO, ehAutopeca } from "./st-sp";
import { FIM_ST_AUTOPECAS_SP, inicioDiaBrasilia } from "./vigencias";

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
  /** Receita segregada (centavos) e DAS calculado com a segregação. */
  segregacao?: SegregacaoDas;
}

// Segregação de receitas no PGDAS-D
// ---------------------------------
// LC 123/2006, art. 18, § 4º-A, I: a receita de revenda com tributação
// concentrada (monofásica) ou com ICMS já recolhido por ST é informada
// separadamente, e o DAS não inclui o percentual desses tributos:
//   - monofásico (Lei 10.485/2002): tira PIS e COFINS da repartição;
//   - ST (até 30/09/2026 para autopeças em SP): tira o ICMS.
// Fontes: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm
//         Solução de Consulta COSIT 204/2019 (citada em
//         https://tributodevido.com.br/portal/tributacao-pis-cofins-monofasica-autopecas-simples-nacional/)
// Depois de 01/10/2026 a autopeça em SP não é mais ST: o ICMS volta para o DAS.
export interface ItemReceitaSimples {
  valorCentavos: number;
  monofasico: boolean;
  st: boolean;
}

export interface SegregacaoDas {
  normalCentavos: number;
  monofasicoCentavos: number;
  stCentavos: number;
  monofasicoEStCentavos: number;
  dasCentavos: number;
  dasSemSegregarCentavos: number;
}

export function calcularDasSegregado(opts: {
  itens: ItemReceitaSimples[];
  aliqEfetiva: number;               // %
  reparticao: Record<string, number>; // % de cada tributo dentro da alíquota efetiva
}): SegregacaoDas {
  const soma = (f: (i: ItemReceitaSimples) => boolean) =>
    opts.itens.filter(f).reduce((a, i) => a + i.valorCentavos, 0);
  const normal = soma((i) => !i.monofasico && !i.st);
  const mono = soma((i) => i.monofasico && !i.st);
  const st = soma((i) => !i.monofasico && i.st);
  const monoSt = soma((i) => i.monofasico && i.st);
  const pct = (t: string) => opts.reparticao[t] ?? 0;
  // valor = receita × alíquota efetiva × (1 − % excluídos), arredondado por grupo
  const das = (receita: number, excluidos: string[]) => {
    const fator = 1 - excluidos.reduce((a, t) => a + pct(t), 0) / 100;
    return Math.round((receita * opts.aliqEfetiva * fator) / 100);
  };
  const total = normal + mono + st + monoSt;
  return {
    normalCentavos: normal,
    monofasicoCentavos: mono,
    stCentavos: st,
    monofasicoEStCentavos: monoSt,
    dasCentavos:
      das(normal, []) +
      das(mono, ["PIS", "COFINS"]) +
      das(st, ["ICMS"]) +
      das(monoSt, ["PIS", "COFINS", "ICMS"]),
    dasSemSegregarCentavos: das(total, []),
  };
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

  // Segregação (monofásico / ST) pelos itens vendidos no mês, proporcional à receita do mês
  let segregacao: SegregacaoDas | undefined;
  if (anexo === "I" && receitaBrutaMes > 0) {
    const itensMes = await prisma.itemVenda.findMany({
      where: {
        venda: {
          empresaId: opts.empresaId,
          criadaEm: { gte: inicioCompetencia, lte: fimCompetencia },
          tipo: "VENDA",
          status: { not: "CANCELADA" },
        },
      },
      select: {
        total: true,
        fiscalNota: true,
        venda: { select: { criadaEm: true } },
        produto: { select: { monofasicoPisCofins: true, cstIcms: true, cest: true, ncm: true } },
      },
    });
    const fimSt = inicioDiaBrasilia(FIM_ST_AUTOPECAS_SP);
    const brutos = itensMes.map((i) => reaisParaCentavos(i.total));
    const ajustados = ratear(reaisParaCentavos(receitaBrutaMes), brutos);
    const itens: ItemReceitaSimples[] = itensMes.map((i, idx) => {
      const retrato = (i.fiscalNota ?? {}) as { cstIcms?: string; monofasico?: boolean };
      const cst = retrato.cstIcms ?? i.produto.cstIcms ?? "";
      return {
        valorCentavos: ajustados[idx],
        monofasico: retrato.monofasico ?? i.produto.monofasicoPisCofins,
        // autopeça só conta como ST até 30/09/2026; outros itens com ST seguem a regra deles
        st: CSTS_ST_SUBSTITUIDO.has(cst) && (i.venda.criadaEm < fimSt || !ehAutopeca(i.produto)),
      };
    });
    if (itens.length) segregacao = calcularDasSegregado({ itens, aliqEfetiva: aliqEfetivaSafe, reparticao: rep });
  }
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
    segregacao,
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
