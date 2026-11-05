// Mapeador IBS/CBS → JSON da Focus NFe
// ====================================
// Os nomes dos campos foram conferidos em 04/11/2026 em:
//   https://doc.focusnfe.com.br/docs/ibs-e-cbs.md            (campos do item)
//   https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html     (tag XML de cada campo e totais)
// Item:  ibs_cbs_situacao_tributaria (CST), ibs_cbs_classificacao_tributaria (cClassTrib),
//        ibs_cbs_base_calculo (vBC), ibs_uf_aliquota (pIBSUF), ibs_uf_valor (vIBSUF),
//        ibs_mun_aliquota (pIBSMun), ibs_mun_valor (vIBSMun), ibs_valor_total (vIBS),
//        cbs_aliquota (pCBS), cbs_valor (vCBS).
// Total: ibs_cbs_base_calculo (vBCIBSCBS), ibs_uf_valor_total (vIBSUF),
//        ibs_mun_valor_total (vIBSMun), ibs_valor_total (vIBS), cbs_valor_total (vCBS).
// A Focus diz que alguns totais são calculados pela API; mandamos assim mesmo
// para conferência. TODO(fiscal): validar em homologação com token Focus se a
// API aceita os totais enviados ou exige omiti-los.
// Se a Focus mudar um nome, muda só aqui.

import { centavosParaReais } from "../fiscal/centavos";
import type { IbsCbsItem } from "../fiscal/ibs-cbs";

export function ibsCbsItemFocus(i: IbsCbsItem): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ibs_cbs_situacao_tributaria: i.cst,
    ibs_cbs_classificacao_tributaria: i.cClassTrib,
  };
  if (!i.comValores) return base;
  return {
    ...base,
    ibs_cbs_base_calculo: centavosParaReais(i.baseCentavos),
    ibs_uf_aliquota: i.aliquotaIbsUf,
    ibs_uf_valor: centavosParaReais(i.ibsUfCentavos),
    ibs_mun_aliquota: i.aliquotaIbsMun,
    ibs_mun_valor: centavosParaReais(i.ibsMunCentavos),
    ibs_valor_total: centavosParaReais(i.ibsCentavos),
    cbs_aliquota: i.aliquotaCbs,
    cbs_valor: centavosParaReais(i.cbsCentavos),
  };
}

export function ibsCbsTotaisFocus(t: {
  baseCentavos: number;
  ibsUfCentavos: number;
  ibsMunCentavos: number;
  cbsCentavos: number;
}): Record<string, unknown> {
  return {
    ibs_cbs_base_calculo: centavosParaReais(t.baseCentavos),
    ibs_uf_valor_total: centavosParaReais(t.ibsUfCentavos),
    ibs_mun_valor_total: centavosParaReais(t.ibsMunCentavos),
    ibs_valor_total: centavosParaReais(t.ibsUfCentavos + t.ibsMunCentavos),
    cbs_valor_total: centavosParaReais(t.cbsCentavos),
  };
}

/**
 * Documento referenciado por item (grupo DFeReferenciado: chaveAcesso + nItem).
 * Campos Focus: chave_acesso_dfe_referenciado, numero_item_dfe_referenciado
 * (https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html, conferido em 04/11/2026).
 */
export function dfeReferenciadoFocus(ref: { chave: string; nItem: number }): Record<string, unknown> {
  return {
    chave_acesso_dfe_referenciado: ref.chave,
    numero_item_dfe_referenciado: String(ref.nItem),
  };
}
