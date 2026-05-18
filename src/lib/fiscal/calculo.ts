// Motor de cálculo fiscal brasileiro
// ==================================
// Implementa as fórmulas oficiais para os impostos que incidem em venda de
// auto peças no Brasil. Cobre:
//   - ICMS por estado (alíquota interna e interestadual)
//   - ICMS-ST (substituição tributária) com MVA-ajustada
//   - DIFAL (diferencial de alíquotas) para consumidor final em outro estado
//   - IPI sobre auto peças (NCMs 8708.*, 8409.*, 8511.*)
//   - PIS/COFINS (cumulativo e não-cumulativo)
//
// Fontes: RICMS de cada estado + Tabela CONFAZ + Resolução SF 13/2012.

export const ALIQUOTAS_ICMS_INTERNAS: Record<string, number> = {
  AC: 19, AL: 19, AP: 18, AM: 20, BA: 20.5, CE: 20, DF: 20, ES: 17, GO: 19,
  MA: 23, MT: 17, MS: 17, MG: 18, PA: 19, PB: 20, PR: 19.5, PE: 20.5, PI: 22.5,
  RJ: 22, RN: 20, RS: 17, RO: 19.5, RR: 20, SC: 17, SP: 18, SE: 19, TO: 20,
};

// Alíquota interestadual depende da origem (Sul/Sudeste→Norte/NE = 7%, demais = 12%).
const ESTADOS_NORTE_NE_CO_ES = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "ES", "GO", "MA", "MT", "MS",
  "PA", "PB", "PE", "PI", "RN", "RO", "RR", "SE", "TO", "DF",
]);

export function aliquotaInterestadual(ufOrigem: string, ufDestino: string): number {
  if (ufOrigem === ufDestino) return ALIQUOTAS_ICMS_INTERNAS[ufOrigem] ?? 18;
  // Origem Sul/Sudeste (exceto ES) vendendo p/ N/NE/CO/ES → 7%
  const sulSudeste = new Set(["MG", "PR", "RS", "RJ", "SC", "SP"]);
  if (sulSudeste.has(ufOrigem) && ESTADOS_NORTE_NE_CO_ES.has(ufDestino)) return 7;
  return 12;
}

// Resolução SF 13/2012: importados ou com conteúdo importado > 40%
// usam 4% interestadual independente da origem.
export function aliquotaInterestadualImportado(): number {
  return 4;
}

export interface CalculoIcmsInput {
  valorProdutos: number;
  valorFrete?: number;
  valorSeguro?: number;
  desconto?: number;
  outrasDespesas?: number;
  ufOrigem: string;
  ufDestino: string;
  origemFiscal: number; // 0..8 conforme tabela CST
  cstIcms: string;      // CSOSN para Simples, CST para Lucro Presumido/Real
  aliquotaInterna?: number;
  reducaoBase?: number; // % de redução
}

export interface CalculoIcmsResultado {
  baseCalculo: number;
  aliquota: number;
  valorIcms: number;
}

export function calcularIcms(input: CalculoIcmsInput): CalculoIcmsResultado {
  const base =
    input.valorProdutos +
    (input.valorFrete ?? 0) +
    (input.valorSeguro ?? 0) +
    (input.outrasDespesas ?? 0) -
    (input.desconto ?? 0);
  const isImportado = input.origemFiscal === 1 || input.origemFiscal === 6;
  const aliquota = isImportado
    ? aliquotaInterestadualImportado()
    : input.ufOrigem === input.ufDestino
      ? input.aliquotaInterna ?? ALIQUOTAS_ICMS_INTERNAS[input.ufOrigem] ?? 18
      : aliquotaInterestadual(input.ufOrigem, input.ufDestino);
  const baseReduzida = input.reducaoBase ? base * (1 - input.reducaoBase / 100) : base;
  // CSTs que não geram ICMS (40, 41, 50, 51 com diferimento total): zera o valor
  const cstsSemIcms = ["40", "41", "50"];
  const valorIcms = cstsSemIcms.includes(input.cstIcms) ? 0 : (baseReduzida * aliquota) / 100;
  return { baseCalculo: baseReduzida, aliquota, valorIcms };
}

// ICMS-ST (substituição tributária): muito comum em auto peças.
// Fórmula: BC-ST = (Valor Op + IPI + Frete + Outras) × (1 + MVA%)
// MVA ajustada: ((1 + MVA) × (1 - Aliq.Inter)) / (1 - Aliq.Interna) - 1
export interface CalculoStInput {
  valorOperacao: number;
  ipi?: number;
  frete?: number;
  outras?: number;
  mvaOriginal: number;       // ex.: 71.78 para auto peças básicas
  aliquotaInterestadual: number;
  aliquotaInterna: number;
  icmsProprio: number;
}

export interface CalculoStResultado {
  mvaAjustada: number;
  baseSt: number;
  valorIcmsSt: number;
}

export function calcularIcmsSt(input: CalculoStInput): CalculoStResultado {
  // MVA ajustada quando a interna > interestadual
  const mvaAjustada =
    ((1 + input.mvaOriginal / 100) *
      (1 - input.aliquotaInterestadual / 100)) /
      (1 - input.aliquotaInterna / 100) -
    1;
  const baseSt =
    (input.valorOperacao + (input.ipi ?? 0) + (input.frete ?? 0) + (input.outras ?? 0)) *
    (1 + mvaAjustada);
  const valorIcmsTotalDestino = (baseSt * input.aliquotaInterna) / 100;
  const valorIcmsSt = Math.max(0, valorIcmsTotalDestino - input.icmsProprio);
  return { mvaAjustada: mvaAjustada * 100, baseSt, valorIcmsSt };
}

// DIFAL: diferencial de alíquotas devido em vendas interestaduais para
// CONSUMIDOR FINAL não contribuinte. Partilha de 100% destino desde 2019.
export interface CalculoDifalInput {
  valorOperacao: number;
  aliquotaInterestadual: number;
  aliquotaInternaDestino: number;
  ufDestino: string;
  consumidorFinal: boolean;
  contribuinteIcms: boolean;
}
export function calcularDifal(input: CalculoDifalInput): {
  difal: number;
  fcp: number;
  total: number;
} {
  if (!input.consumidorFinal || input.contribuinteIcms)
    return { difal: 0, fcp: 0, total: 0 };
  const baseDif = input.valorOperacao;
  const difal =
    (baseDif * (input.aliquotaInternaDestino - input.aliquotaInterestadual)) / 100;
  // FCP (Fundo de Combate à Pobreza) — 1% a 2% em alguns estados
  const fcpUf: Record<string, number> = {
    RJ: 2, BA: 2, CE: 2, PE: 2, DF: 1, MG: 1, PI: 2, SE: 1, MA: 2,
  };
  const fcp = ((input.valorOperacao * (fcpUf[input.ufDestino] ?? 0)) / 100);
  return { difal, fcp, total: difal + fcp };
}

// IPI — auto peças têm alíquotas baixas (3.25% a 8% conforme NCM).
// Tabela TIPI; aqui guardamos a alíquota no produto e só aplicamos.
export function calcularIpi(valorBase: number, aliquota: number): number {
  return (valorBase * aliquota) / 100;
}

// PIS/COFINS — Simples Nacional fora; Lucro Presumido cumulativo (0.65% + 3%);
// Lucro Real não-cumulativo (1.65% + 7.6%) com créditos.
export interface CalculoPisCofinsInput {
  baseCalculo: number;
  regime: "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL";
  cstPis?: string;
  cstCofins?: string;
}
export function calcularPisCofins(input: CalculoPisCofinsInput): {
  pis: number;
  cofins: number;
} {
  if (input.regime === "SIMPLES_NACIONAL") return { pis: 0, cofins: 0 };
  if (input.regime === "LUCRO_PRESUMIDO") {
    return {
      pis: (input.baseCalculo * 0.65) / 100,
      cofins: (input.baseCalculo * 3) / 100,
    };
  }
  return {
    pis: (input.baseCalculo * 1.65) / 100,
    cofins: (input.baseCalculo * 7.6) / 100,
  };
}

// Cálculo unificado de um item — usado pelo emissor antes de fechar a NF-e.
export interface ItemFiscalInput {
  valorProdutos: number;
  frete?: number;
  desconto?: number;
  ufOrigem: string;
  ufDestino: string;
  origemFiscal: number;
  cstIcms: string;
  aliquotaInterna?: number;
  mvaSt?: number;
  ipiAliquota?: number;
  regime: "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL";
  consumidorFinal: boolean;
  contribuinteIcms: boolean;
}

export function calcularItemFiscal(item: ItemFiscalInput) {
  const aliquotaInterestadual2 = aliquotaInterestadual(item.ufOrigem, item.ufDestino);
  const icms = calcularIcms({
    valorProdutos: item.valorProdutos,
    valorFrete: item.frete,
    desconto: item.desconto,
    ufOrigem: item.ufOrigem,
    ufDestino: item.ufDestino,
    origemFiscal: item.origemFiscal,
    cstIcms: item.cstIcms,
    aliquotaInterna: item.aliquotaInterna,
  });
  const ipi = item.ipiAliquota
    ? calcularIpi(icms.baseCalculo, item.ipiAliquota)
    : 0;
  const st = item.mvaSt
    ? calcularIcmsSt({
        valorOperacao: icms.baseCalculo,
        ipi,
        mvaOriginal: item.mvaSt,
        aliquotaInterestadual: aliquotaInterestadual2,
        aliquotaInterna:
          item.aliquotaInterna ??
          ALIQUOTAS_ICMS_INTERNAS[item.ufDestino] ??
          18,
        icmsProprio: icms.valorIcms,
      })
    : { mvaAjustada: 0, baseSt: 0, valorIcmsSt: 0 };
  const difal = calcularDifal({
    valorOperacao: icms.baseCalculo,
    aliquotaInterestadual: aliquotaInterestadual2,
    aliquotaInternaDestino:
      ALIQUOTAS_ICMS_INTERNAS[item.ufDestino] ?? 18,
    ufDestino: item.ufDestino,
    consumidorFinal: item.consumidorFinal,
    contribuinteIcms: item.contribuinteIcms,
  });
  const pisCofins = calcularPisCofins({
    baseCalculo: icms.baseCalculo,
    regime: item.regime,
  });
  return {
    icms,
    ipi,
    st,
    difal,
    pis: pisCofins.pis,
    cofins: pisCofins.cofins,
    totalImpostos:
      icms.valorIcms + ipi + st.valorIcmsSt + difal.total + pisCofins.pis + pisCofins.cofins,
  };
}
