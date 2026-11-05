// Montagem e validação da nota (puro, sem banco)
// =============================================
// Recebe os dados já carregados (empresa, cliente, itens) e devolve:
//   - { ok: false, erros } quando falta algo obrigatório — a emissão BLOQUEIA
//     com mensagem em português (nota errada é multa para o cliente);
//   - { ok: true, payload, totais, itens } com o JSON no formato da Focus NFe.
// Todo valor é calculado em centavos e arredondado por item.
// Campos Focus: https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html (conferido 04/11/2026).

import {
  aplicarAliquota,
  centavosParaReais,
  multiplicarQtdPreco,
  ratear,
} from "../fiscal/centavos";
import { ALIQUOTAS_ICMS_INTERNAS, aliquotaInterestadual } from "../fiscal/calculo";
import { calcularIbsCbsItem, type ConfigIbsCbsEmpresa, type IbsCbsItem } from "../fiscal/ibs-cbs";
import { resolverPisCofins, type PisCofinsResolvido } from "../fiscal/pis-cofins";
import { ehSimples, erroStAutopecaSp, erroStSemCestSp, type RegimeEmitente } from "../fiscal/st-sp";
import { dfeReferenciadoFocus, ibsCbsItemFocus, ibsCbsTotaisFocus } from "./focus-ibs-cbs";

export interface ConfigFiscalEmpresa {
  ibsCbs?: ConfigIbsCbsEmpresa;
  cstPisCofinsSimples?: string;
}

export interface EmitenteNota {
  cnpj: string;
  inscricaoEstadual?: string | null;
  uf?: string | null;
  regime: RegimeEmitente;
  config?: ConfigFiscalEmpresa | null;
}

export interface DestinatarioNota {
  cpfCnpj?: string | null;
  nome: string;
  email?: string | null;
  inscricaoEstadual?: string | null;
  endereco?: {
    logradouro?: string | null;
    numero?: string | null;
    bairro?: string | null;
    municipio?: string | null;
    uf?: string | null;
    cep?: string | null;
  } | null;
}

export interface ItemEntradaNota {
  sku: string;
  codigoBarras?: string | null;
  nome: string;
  ncm?: string | null;
  cest?: string | null;
  unidade: string;
  quantidade: number | string;
  valorUnitario: number | string;
  descontoCentavos: number;
  origem: number;
  cstIcms?: string | null;
  cfopInterna?: string | null;
  cfopInterestadual?: string | null;
  /** CFOP já decidido (devolução). Quando presente, ignora interna/interestadual. */
  cfopFixo?: string | null;
  aliquotaIcms?: number | null;
  monofasico?: boolean | null;
  cstPis?: string | null;
  cstCofins?: string | null;
  pisAliquota?: number | null;
  cofinsAliquota?: number | null;
  cstIbsCbs?: string | null;
  cClassTrib?: string | null;
  /** Devolução: nota e item de origem (DFeReferenciado). */
  referencia?: { chave: string; nItem: number } | null;
}

export interface DadosNota {
  modelo: "55" | "65";
  finalidade: 1 | 4;
  tipoDocumento: 0 | 1;
  natureza: string;
  dataEmissao: Date;
  emitente: EmitenteNota;
  destinatario: DestinatarioNota;
  itens: ItemEntradaNota[];
  freteCentavos?: number;
  pagamentos: Array<{ forma: string; valorCentavos: number }>;
  presenca: "PRESENCIAL" | "INTERNET" | "TELEATENDIMENTO" | "ENTREGA_DOMICILIO" | "NAO_SE_APLICA";
  notasReferenciadas?: string[];
}

export interface ItemCalculado {
  numeroItem: number;
  cfop: string;
  cstIcms: string;
  valorProdutosCentavos: number;
  descontoCentavos: number;
  freteCentavos: number;
  baseIcmsCentavos: number;
  aliquotaIcms: number;
  icmsCentavos: number;
  pisCofins: PisCofinsResolvido;
  ibsCbs: IbsCbsItem | null;
}

export interface TotaisNota {
  produtosCentavos: number;
  descontoCentavos: number;
  freteCentavos: number;
  icmsCentavos: number;
  pisCentavos: number;
  cofinsCentavos: number;
  ibsCentavos: number;
  cbsCentavos: number;
  totalCentavos: number;
}

export type ResultadoMontagem =
  | { ok: true; payload: Record<string, unknown>; totais: TotaisNota; itens: ItemCalculado[] }
  | { ok: false; erros: string[] };

const CSOSN_ACEITOS = new Set(["102", "103", "300", "400", "500"]);
const CST_ACEITOS = new Set(["00", "40", "41", "60"]);
/** Resolução SF 13/2012: 4% interestadual para importados (origens 1, 2, 3 e 8). */
const ORIGENS_4_PORCENTO = new Set([1, 2, 3, 8]);

const digitos = (s?: string | null) => (s ?? "").replace(/\D/g, "");

export function montarNota(d: DadosNota): ResultadoMontagem {
  const erros: string[] = [];
  const regime = d.emitente.regime;
  const simples = ehSimples(regime);
  const ufEmit = (d.emitente.uf ?? "").toUpperCase();
  const cnpjEmit = digitos(d.emitente.cnpj);

  // ---------- Emitente ----------
  if (cnpjEmit.length !== 14) erros.push("CNPJ da empresa inválido. Corrija em Configurações > Empresa.");
  if (!ufEmit) erros.push("UF da empresa não cadastrada. Corrija em Configurações > Empresa.");
  if (!digitos(d.emitente.inscricaoEstadual))
    erros.push("Inscrição estadual da empresa não cadastrada. Corrija em Configurações > Empresa.");

  // ---------- Destinatário ----------
  const doc = digitos(d.destinatario.cpfCnpj);
  if (doc && doc.length !== 11 && doc.length !== 14) erros.push("CPF/CNPJ do cliente inválido.");
  const end = d.destinatario.endereco;
  const ufDest = (d.modelo === "65" ? ufEmit : (end?.uf ?? ufEmit)).toUpperCase();
  const contribuinte = doc.length === 14 && !!digitos(d.destinatario.inscricaoEstadual);
  if (d.modelo === "55") {
    if (!doc) erros.push("NF-e exige CPF ou CNPJ do cliente. Para consumidor sem cadastro, use NFC-e.");
    const faltando = (
      [
        ["logradouro", end?.logradouro],
        ["número", end?.numero],
        ["bairro", end?.bairro],
        ["município", end?.municipio],
        ["UF", end?.uf],
        ["CEP", end?.cep],
      ] as const
    )
      .filter(([, v]) => !v || !String(v).trim())
      .map(([k]) => k);
    if (faltando.length) erros.push(`Endereço do cliente incompleto para NF-e: falta ${faltando.join(", ")}.`);
  }
  const interestadual = !!ufEmit && ufDest !== ufEmit;
  if (interestadual && d.finalidade === 1 && !contribuinte) {
    erros.push(
      "Venda para consumidor final de outro estado exige DIFAL, que a emissão automática ainda não calcula. Emita com o contador ou pelo emissor da Focus.",
    );
  }

  // ---------- Itens ----------
  if (!d.itens.length) erros.push("A nota não tem itens.");
  const brutos = d.itens.map((it) => multiplicarQtdPreco(it.quantidade, it.valorUnitario));
  const fretes = ratear(d.freteCentavos ?? 0, brutos);
  const itensCalc: ItemCalculado[] = [];

  d.itens.forEach((it, idx) => {
    const n = idx + 1;
    const rotulo = `Item ${n} (${it.sku} — ${it.nome})`;
    const ncm = digitos(it.ncm);
    if (ncm.length !== 8 || ncm === "00000000") {
      erros.push(`${rotulo}: falta o NCM (8 dígitos). Sem NCM a SEFAZ rejeita a nota. Cadastre no produto.`);
    }
    const cest = digitos(it.cest);
    if (it.cest && cest.length !== 7) erros.push(`${rotulo}: CEST deve ter 7 dígitos.`);
    if (!it.unidade?.trim()) erros.push(`${rotulo}: unidade não cadastrada.`);
    if (!(Number(it.quantidade) > 0)) erros.push(`${rotulo}: quantidade precisa ser maior que zero.`);
    if (!(Number(it.valorUnitario) > 0)) erros.push(`${rotulo}: preço precisa ser maior que zero.`);
    if (!Number.isInteger(it.origem) || it.origem < 0 || it.origem > 8)
      erros.push(`${rotulo}: origem da mercadoria inválida (0 a 8).`);
    if (it.descontoCentavos < 0 || it.descontoCentavos > brutos[idx])
      erros.push(`${rotulo}: desconto maior que o valor do item.`);

    const cfop = digitos(
      it.cfopFixo ?? (interestadual ? it.cfopInterestadual : it.cfopInterna),
    );
    const primeiro = cfop[0];
    const cfopOk =
      cfop.length === 4 &&
      (d.tipoDocumento === 1 ? ["5", "6", "7"] : ["1", "2", "3"]).includes(primeiro) &&
      (interestadual ? ["6", "2"] : ["5", "1"]).includes(primeiro);
    if (!cfopOk) {
      erros.push(
        `${rotulo}: CFOP ${cfop || "(vazio)"} não serve para ${d.tipoDocumento === 1 ? "saída" : "entrada"} ` +
          `${interestadual ? "interestadual" : "dentro do estado"}. Corrija o cadastro fiscal do produto.`,
      );
    }

    const cst = (it.cstIcms ?? "").trim();
    if (!cst) {
      erros.push(`${rotulo}: falta ${simples ? "CSOSN" : "CST"} do ICMS no produto.`);
    } else if (simples && !CSOSN_ACEITOS.has(cst)) {
      erros.push(
        `${rotulo}: CSOSN ${cst} não é aceito na emissão automática (aceitos: ${[...CSOSN_ACEITOS].join(", ")}). ` +
          (cst.length === 2 ? "A empresa é do Simples: use CSOSN (3 dígitos), não CST." : "Confira com o contador."),
      );
    } else if (!simples && !CST_ACEITOS.has(cst)) {
      erros.push(
        `${rotulo}: CST ${cst} não é aceito na emissão automática (aceitos: ${[...CST_ACEITOS].join(", ")}). ` +
          (cst.length === 3 ? "A empresa é do regime normal: use CST (2 dígitos), não CSOSN." : "Confira com o contador."),
      );
    }

    // Fim da ST de autopeças em SP (só na venda; devolução espelha a nota original).
    if (d.finalidade === 1) {
      const errSt = erroStAutopecaSp({
        ufEmitente: ufEmit,
        ufDestino: ufDest,
        dataOperacao: d.dataEmissao,
        produto: { ncm: it.ncm, cest: it.cest, nome: it.nome, sku: it.sku },
        cstUsado: cst,
        cfopUsado: cfop,
      });
      if (errSt) erros.push(errSt);
      else {
        const errCest = erroStSemCestSp({
          ufEmitente: ufEmit,
          dataOperacao: d.dataEmissao,
          produto: { cest: it.cest, nome: it.nome, sku: it.sku },
          cstUsado: cst,
          cfopUsado: cfop,
        });
        if (errCest) erros.push(errCest);
      }
    }

    if (d.finalidade === 4 && !it.referencia) {
      erros.push(`${rotulo}: devolução sem a nota e o item de origem (exigido desde 03/11/2026, Rej. 321).`);
    }

    // ---------- Valores ----------
    const bruto = brutos[idx];
    const desc = it.descontoCentavos;
    const frete = fretes[idx];
    let baseIcms = 0;
    let aliqIcms = 0;
    let icms = 0;
    if (!simples && cst === "00") {
      baseIcms = bruto - desc + frete;
      aliqIcms = interestadual
        ? ORIGENS_4_PORCENTO.has(it.origem) ? 4 : aliquotaInterestadual(ufEmit, ufDest)
        : it.aliquotaIcms ?? ALIQUOTAS_ICMS_INTERNAS[ufEmit] ?? 0;
      if (!aliqIcms) erros.push(`${rotulo}: alíquota de ICMS não definida.`);
      icms = aplicarAliquota(baseIcms, aliqIcms);
    }
    const pc = resolverPisCofins({
      regime,
      baseCentavos: bruto - desc + frete,
      monofasico: it.monofasico,
      cstPis: it.cstPis,
      cstCofins: it.cstCofins,
      pisAliquota: it.pisAliquota,
      cofinsAliquota: it.cofinsAliquota,
      cstSimplesPadrao: d.emitente.config?.cstPisCofinsSimples,
    });
    const rIbs = calcularIbsCbsItem({
      regime,
      data: d.dataEmissao,
      produtoNome: `${it.sku} (${it.nome})`,
      cstProduto: it.cstIbsCbs,
      cClassTribProduto: it.cClassTrib,
      config: d.emitente.config?.ibsCbs,
      valorProdutosCentavos: bruto,
      freteCentavos: frete,
      descontoCentavos: desc,
      icmsCentavos: icms,
      pisCentavos: pc.pisCentavos,
      cofinsCentavos: pc.cofinsCentavos,
    });
    if ("erro" in rIbs) erros.push(`${rotulo}: ${rIbs.erro}`);
    itensCalc.push({
      numeroItem: n,
      cfop,
      cstIcms: cst,
      valorProdutosCentavos: bruto,
      descontoCentavos: desc,
      freteCentavos: frete,
      baseIcmsCentavos: baseIcms,
      aliquotaIcms: aliqIcms,
      icmsCentavos: icms,
      pisCofins: pc,
      ibsCbs: "enviar" in rIbs && rIbs.enviar ? rIbs.item : null,
    });
  });

  const soma = (f: (i: ItemCalculado) => number) => itensCalc.reduce((a, i) => a + f(i), 0);
  const totais: TotaisNota = {
    produtosCentavos: soma((i) => i.valorProdutosCentavos),
    descontoCentavos: soma((i) => i.descontoCentavos),
    freteCentavos: soma((i) => i.freteCentavos),
    icmsCentavos: soma((i) => i.icmsCentavos),
    pisCentavos: soma((i) => i.pisCofins.pisCentavos),
    cofinsCentavos: soma((i) => i.pisCofins.cofinsCentavos),
    ibsCentavos: soma((i) => i.ibsCbs?.ibsCentavos ?? 0),
    cbsCentavos: soma((i) => i.ibsCbs?.cbsCentavos ?? 0),
    totalCentavos: 0,
  };
  // Em 2026 o IBS/CBS não soma no total da nota (orientação ENCAT); ICMS próprio está "por dentro".
  totais.totalCentavos = totais.produtosCentavos - totais.descontoCentavos + totais.freteCentavos;

  if (d.finalidade === 1) {
    const pago = d.pagamentos.reduce((a, p) => a + p.valorCentavos, 0);
    if (pago < totais.totalCentavos) {
      erros.push(
        `Pagamentos (R$ ${(pago / 100).toFixed(2)}) menores que o total da nota (R$ ${(totais.totalCentavos / 100).toFixed(2)}).`,
      );
    }
  }

  if (erros.length) return { ok: false, erros };

  return { ok: true, payload: payloadFocus(d, itensCalc, totais, { ufDest, interestadual, contribuinte }), totais, itens: itensCalc };
}

function payloadFocus(
  d: DadosNota,
  itens: ItemCalculado[],
  totais: TotaisNota,
  ctx: { ufDest: string; interestadual: boolean; contribuinte: boolean },
): Record<string, unknown> {
  const simples = ehSimples(d.emitente.regime);
  const doc = digitos(d.destinatario.cpfCnpj);
  const end = d.destinatario.endereco;
  const temIbsCbs = itens.some((i) => i.ibsCbs);

  const out: Record<string, unknown> = {
    natureza_operacao: d.natureza,
    data_emissao: d.dataEmissao.toISOString(),
    tipo_documento: String(d.tipoDocumento),
    finalidade_emissao: String(d.finalidade),
    local_destino: ctx.interestadual ? "2" : "1",
    consumidor_final: ctx.contribuinte ? "0" : "1",
    presenca_comprador:
      d.presenca === "PRESENCIAL" ? "1" :
      d.presenca === "INTERNET" ? "2" :
      d.presenca === "TELEATENDIMENTO" ? "3" :
      d.presenca === "ENTREGA_DOMICILIO" ? "4" : "0",
    regime_tributario_emitente: d.emitente.regime === "SIMPLES_EXCESSO_SUBLIMITE" ? "2" : simples ? "1" : "3",
    cnpj_emitente: digitos(d.emitente.cnpj),
    nome_destinatario: d.destinatario.nome,
    modalidade_frete: totais.freteCentavos > 0 ? "0" : "9",
  };
  if (doc.length === 11) out.cpf_destinatario = doc;
  if (doc.length === 14) out.cnpj_destinatario = doc;
  if (d.modelo === "55") {
    out.indicador_inscricao_estadual_destinatario = ctx.contribuinte ? "1" : "9";
    if (ctx.contribuinte) out.inscricao_estadual_destinatario = digitos(d.destinatario.inscricaoEstadual);
    out.logradouro_destinatario = end?.logradouro;
    out.numero_destinatario = end?.numero;
    out.bairro_destinatario = end?.bairro;
    out.municipio_destinatario = end?.municipio;
    out.uf_destinatario = ctx.ufDest;
    out.cep_destinatario = digitos(end?.cep);
    if (d.destinatario.email) out.email_destinatario = d.destinatario.email;
  }
  if (d.notasReferenciadas?.length) {
    out.notas_referenciadas = d.notasReferenciadas.map((chave) => ({ chave_nfe: chave }));
  }

  out.items = itens.map((c, idx) => {
    const it = d.itens[idx];
    const ean = digitos(it.codigoBarras);
    const eanValido = [8, 12, 13, 14].includes(ean.length) ? ean : "SEM GTIN";
    const linha: Record<string, unknown> = {
      numero_item: c.numeroItem,
      codigo_produto: it.sku,
      codigo_barras_comercial: eanValido,
      codigo_barras_tributavel: eanValido,
      descricao: it.nome,
      codigo_ncm: digitos(it.ncm),
      cfop: c.cfop,
      unidade_comercial: it.unidade,
      quantidade_comercial: Number(it.quantidade),
      valor_unitario_comercial: Number(it.valorUnitario),
      unidade_tributavel: it.unidade,
      quantidade_tributavel: Number(it.quantidade),
      valor_unitario_tributavel: Number(it.valorUnitario),
      valor_bruto: centavosParaReais(c.valorProdutosCentavos),
      inclui_no_total: "1",
      icms_origem: String(it.origem),
      icms_situacao_tributaria: c.cstIcms,
      pis_situacao_tributaria: c.pisCofins.cstPis,
      cofins_situacao_tributaria: c.pisCofins.cstCofins,
    };
    if (digitos(it.cest)) linha.cest = digitos(it.cest);
    if (c.descontoCentavos) linha.valor_desconto = centavosParaReais(c.descontoCentavos);
    if (c.freteCentavos) linha.valor_frete = centavosParaReais(c.freteCentavos);
    if (c.cstIcms === "00") {
      linha.icms_modalidade_base_calculo = "3"; // valor da operação
      linha.icms_base_calculo = centavosParaReais(c.baseIcmsCentavos);
      linha.icms_aliquota = c.aliquotaIcms;
      linha.icms_valor = centavosParaReais(c.icmsCentavos);
    }
    if (["01", "02", "49", "99"].includes(c.pisCofins.cstPis)) {
      linha.pis_base_calculo = centavosParaReais(c.pisCofins.baseCentavos);
      linha.pis_aliquota_porcentual = c.pisCofins.aliquotaPis;
      linha.pis_valor = centavosParaReais(c.pisCofins.pisCentavos);
    }
    if (["01", "02", "49", "99"].includes(c.pisCofins.cstCofins)) {
      linha.cofins_base_calculo = centavosParaReais(c.pisCofins.baseCentavos);
      linha.cofins_aliquota_porcentual = c.pisCofins.aliquotaCofins;
      linha.cofins_valor = centavosParaReais(c.pisCofins.cofinsCentavos);
    }
    if (c.ibsCbs) Object.assign(linha, ibsCbsItemFocus(c.ibsCbs));
    if (it.referencia) Object.assign(linha, dfeReferenciadoFocus(it.referencia));
    return linha;
  });

  if (temIbsCbs) {
    Object.assign(
      out,
      ibsCbsTotaisFocus({
        baseCentavos: itens.reduce((a, i) => a + (i.ibsCbs?.baseCentavos ?? 0), 0),
        ibsUfCentavos: itens.reduce((a, i) => a + (i.ibsCbs?.ibsUfCentavos ?? 0), 0),
        ibsMunCentavos: itens.reduce((a, i) => a + (i.ibsCbs?.ibsMunCentavos ?? 0), 0),
        cbsCentavos: totais.cbsCentavos,
      }),
    );
  }

  out.formas_pagamento =
    d.finalidade === 4
      ? [{ forma_pagamento: "90", valor_pagamento: 0 }] // 90 = sem pagamento
      : d.pagamentos.map((p) => ({
          forma_pagamento: mapearFormaFocus(p.forma),
          valor_pagamento: centavosParaReais(p.valorCentavos),
        }));
  return out;
}

/** Tabela tPag (MOC NF-e). */
export function mapearFormaFocus(forma: string): string {
  return (
    {
      DINHEIRO: "01",
      CHEQUE: "02",
      CREDITO: "03",
      DEBITO: "04",
      CREDIARIO: "05",
      VALE_PRESENTE: "11",
      BOLETO: "15",
      PIX: "17",
      TRANSFERENCIA: "18",
    } as Record<string, string>
  )[forma] ?? "99";
}
