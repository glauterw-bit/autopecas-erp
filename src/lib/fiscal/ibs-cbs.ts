// IBS/CBS na nota (reforma tributária)
// ===================================
// LC 214/2025 + NT 2025.002-RTC (grupo IBSCBS por item, totais IBSCBSTot).
//   LC 214/2025: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm
//   NT 2025.002: https://www.nfe.fazenda.gov.br/portal/
//
// Quem é obrigado e desde quando: ver vigencias.ts (Ato Conjunto RFB/CGIBS 4/2026).
// CST e cClassTrib vêm do produto ou do padrão da empresa; sem nenhum dos dois
// a emissão bloqueia — usar "000/000001" (tributação integral) para tudo é erro
// conhecido e não fazemos isso sozinhos.
//
// Base de cálculo (vBC do IBSCBS), conforme regra de validação da NT 2025.002
// lida em fonte secundária: vProd + vFrete + vSeg + vOutro − vDesc − vICMS −
// vPIS − vCOFINS − vFCP (IBS/CBS não integram a própria base).
//   https://lopescastelo.adv.br/reforma-tributaria-base-de-calculo-da-cbs-ibs-e-nota-tecnica-2025-002-rtc/
//   https://ajuda.alterdata.com.br/bimerbase/bimer-reforma-tributaria/reforma-tributaria-impacto-de-outros-tributos-na-bc-de-ibs-cbs
// PENDENTE CONTADOR: confirmar a fórmula na versão vigente da NT (v1.53).
// Em 2026 o IBS/CBS não soma no total da nota (orientação ENCAT).

import { aplicarAliquota } from "./centavos";
import {
  aliquotasIbsCbs,
  IBS_CBS_OBRIGATORIO_REGIME_NORMAL,
  IBS_CBS_OBRIGATORIO_SIMPLES,
  naOuDepois,
  type AliquotasIbsCbs,
} from "./vigencias";
import { ehSimples, type RegimeEmitente } from "./st-sp";

/** CSTs IBS/CBS suportados hoje. Tabela oficial: Portal NF-e (cClassTrib/CST). */
export const CST_IBS_CBS_TRIBUTADO_INTEGRAL = "000";
const CSTS_SEM_VALOR = new Set(["410"]); // imunidade e não incidência: só CST + cClassTrib
const CSTS_SUPORTADOS = new Set([CST_IBS_CBS_TRIBUTADO_INTEGRAL, ...CSTS_SEM_VALOR]);
export const CST_IBS_CBS_SUPORTADOS: ReadonlySet<string> = CSTS_SUPORTADOS;

export interface ConfigIbsCbsEmpresa {
  cst?: string;
  cClassTrib?: string;
  /** Sobrescreve a tabela de vigencias.ts por ano: {"2027": {cbs, ibsUf, ibsMun, fonte}}. */
  aliquotas?: Record<string, AliquotasIbsCbs>;
  /** Simples manda o grupo antes de 2027 (opcional). Padrão: não. */
  simplesAntecipar?: boolean;
}

export function ibsCbsObrigatorio(regime: RegimeEmitente, data: Date): boolean {
  return ehSimples(regime)
    ? naOuDepois(data, IBS_CBS_OBRIGATORIO_SIMPLES)
    : naOuDepois(data, IBS_CBS_OBRIGATORIO_REGIME_NORMAL);
}

export interface IbsCbsItem {
  cst: string;
  cClassTrib: string;
  baseCentavos: number;
  aliquotaCbs: number;
  aliquotaIbsUf: number;
  aliquotaIbsMun: number;
  cbsCentavos: number;
  ibsUfCentavos: number;
  ibsMunCentavos: number;
  ibsCentavos: number;
  comValores: boolean;
}

export type ResultadoIbsCbs =
  | { enviar: false }
  | { enviar: true; item: IbsCbsItem }
  | { erro: string };

export function calcularIbsCbsItem(opts: {
  regime: RegimeEmitente;
  data: Date;
  produtoNome: string;
  cstProduto?: string | null;
  cClassTribProduto?: string | null;
  config?: ConfigIbsCbsEmpresa | null;
  valorProdutosCentavos: number;
  freteCentavos: number;
  descontoCentavos: number;
  icmsCentavos: number;
  pisCentavos: number;
  cofinsCentavos: number;
}): ResultadoIbsCbs {
  const obrigatorio = ibsCbsObrigatorio(opts.regime, opts.data);
  const antecipar = ehSimples(opts.regime) && !!opts.config?.simplesAntecipar;
  if (!obrigatorio && !antecipar) return { enviar: false };

  const cst = (opts.cstProduto || opts.config?.cst || "").trim();
  const cClassTrib = (opts.cClassTribProduto || opts.config?.cClassTrib || "").trim();
  if (!/^\d{3}$/.test(cst) || !/^\d{6}$/.test(cClassTrib)) {
    return {
      erro:
        `O produto ${opts.produtoNome} está sem CST (3 dígitos) e cClassTrib (6 dígitos) de IBS/CBS. ` +
        `Desde 03/08/2026 a nota do regime normal precisa desse grupo (Ato Conjunto RFB/CGIBS 4/2026). ` +
        `Peça ao contador e preencha no produto ou no padrão da empresa.`,
    };
  }
  if (!CSTS_SUPORTADOS.has(cst)) {
    return {
      erro: `CST de IBS/CBS ${cst} do produto ${opts.produtoNome} ainda não é calculado pelo sistema. Fale com o suporte antes de emitir.`,
    };
  }

  const aliq = aliquotasIbsCbs(opts.data, opts.config?.aliquotas);
  if (!aliq) {
    return {
      erro: `Não há alíquota de IBS/CBS definida para ${opts.data.getFullYear()}. Cadastre a alíquota oficial em Configurações > Fiscal antes de emitir.`,
    };
  }

  const base = Math.max(
    0,
    opts.valorProdutosCentavos +
      opts.freteCentavos -
      opts.descontoCentavos -
      opts.icmsCentavos -
      opts.pisCentavos -
      opts.cofinsCentavos,
  );
  const comValores = !CSTS_SEM_VALOR.has(cst);
  const cbs = comValores ? aplicarAliquota(base, aliq.cbs) : 0;
  const ibsUf = comValores ? aplicarAliquota(base, aliq.ibsUf) : 0;
  const ibsMun = comValores ? aplicarAliquota(base, aliq.ibsMun) : 0;
  return {
    enviar: true,
    item: {
      cst,
      cClassTrib,
      baseCentavos: comValores ? base : 0,
      aliquotaCbs: comValores ? aliq.cbs : 0,
      aliquotaIbsUf: comValores ? aliq.ibsUf : 0,
      aliquotaIbsMun: comValores ? aliq.ibsMun : 0,
      cbsCentavos: cbs,
      ibsUfCentavos: ibsUf,
      ibsMunCentavos: ibsMun,
      ibsCentavos: ibsUf + ibsMun,
      comValores,
    },
  };
}
