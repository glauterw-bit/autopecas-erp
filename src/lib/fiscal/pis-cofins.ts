// PIS/COFINS por produto
// ======================
// Ordem de decisão (por item):
//  1. CST gravado no produto (cstPis/cstCofins) — o contador manda.
//  2. Produto monofásico (Lei 10.485/2002, Anexos I e II — autopeças e pneus):
//     na revenda a alíquota é zero, CST 04 "Operação tributável monofásica —
//     revenda a alíquota zero", em qualquer regime.
//     Lei: https://www2.camara.leg.br/legin/fed/lei/2002/lei-10485-3-julho-2002-464514-normaatualizada-pl.pdf
//  3. Simples Nacional: PIS/COFINS são recolhidos no DAS, não destacados.
//     CST padrão 49 ("Outras operações de saída"), configurável por empresa
//     em configuracoes.fiscal.cstPisCofinsSimples.
//     PENDENTE CONTADOR: confirmar 49 x 99 para o cliente.
//  4. Lucro Presumido (cumulativo, Lei 9.718/1998): CST 01, PIS 0,65% e COFINS 3%.
//  5. Lucro Real (não cumulativo, Leis 10.637/2002 e 10.833/2003): CST 01, 1,65% e 7,6%.
// Valores em centavos, arredondados por item.

import { aplicarAliquota } from "./centavos";
import type { RegimeEmitente } from "./st-sp";
import { ehSimples } from "./st-sp";

export const CST_PIS_COFINS_MONOFASICO_REVENDA = "04";
export const CST_PIS_COFINS_SIMPLES_PADRAO = "49";

export interface PisCofinsResolvido {
  cstPis: string;
  cstCofins: string;
  aliquotaPis: number;
  aliquotaCofins: number;
  baseCentavos: number;
  pisCentavos: number;
  cofinsCentavos: number;
  /** true quando a receita é monofásica (segregar no PGDAS-D / EFD-Contribuições). */
  monofasico: boolean;
}

/** CSTs que destacam alíquota percentual (Tabela CST PIS/COFINS, IN RFB 1.009/2010). */
const CSTS_COM_ALIQUOTA = new Set(["01", "02"]);

export function resolverPisCofins(opts: {
  regime: RegimeEmitente;
  baseCentavos: number;
  monofasico?: boolean | null;
  cstPis?: string | null;
  cstCofins?: string | null;
  pisAliquota?: number | null;
  cofinsAliquota?: number | null;
  cstSimplesPadrao?: string | null;
}): PisCofinsResolvido {
  const simples = ehSimples(opts.regime);
  const monofasico = !!opts.monofasico;

  let cstPis: string;
  let cstCofins: string;
  if (opts.cstPis && opts.cstCofins) {
    cstPis = opts.cstPis;
    cstCofins = opts.cstCofins;
  } else if (monofasico) {
    cstPis = cstCofins = CST_PIS_COFINS_MONOFASICO_REVENDA;
  } else if (simples) {
    cstPis = cstCofins = opts.cstSimplesPadrao || CST_PIS_COFINS_SIMPLES_PADRAO;
  } else {
    cstPis = cstCofins = "01";
  }

  let aliquotaPis = 0;
  let aliquotaCofins = 0;
  if (!simples && CSTS_COM_ALIQUOTA.has(cstPis)) {
    aliquotaPis = opts.pisAliquota ?? (opts.regime === "LUCRO_REAL" ? 1.65 : 0.65);
  }
  if (!simples && CSTS_COM_ALIQUOTA.has(cstCofins)) {
    aliquotaCofins = opts.cofinsAliquota ?? (opts.regime === "LUCRO_REAL" ? 7.6 : 3);
  }

  return {
    cstPis,
    cstCofins,
    aliquotaPis,
    aliquotaCofins,
    baseCentavos: aliquotaPis || aliquotaCofins ? opts.baseCentavos : 0,
    pisCentavos: aplicarAliquota(opts.baseCentavos, aliquotaPis),
    cofinsCentavos: aplicarAliquota(opts.baseCentavos, aliquotaCofins),
    monofasico: monofasico || cstPis === CST_PIS_COFINS_MONOFASICO_REVENDA,
  };
}
