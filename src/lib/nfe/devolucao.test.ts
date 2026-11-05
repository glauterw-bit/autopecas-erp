import { describe, it, expect } from "vitest";
import { agruparPedidos, cfopDevolucao, montarItensDevolucao, refDevolucao, type ItemOriginal } from "./devolucao";
import { montarNota, type DadosNota } from "./payload";
import { itensDoXmlNfe } from "./xml-nfe";

const CNPJ = "12345678000195";
// chave = cUF(35) + AAMM(2611) + CNPJ + mod(55) + série(001) + nNF(000000123) + tpEmis(1) + cNF(00000123) + DV(4)
const CHAVE = `352611${CNPJ}55001000000123100000123` + "4";
const DATA = new Date("2026-11-04T13:00:00.000Z");

const original: ItemOriginal = {
  itemVendaId: "iv1",
  sku: "PAST-001",
  nome: "Pastilha de freio dianteira",
  codigoBarras: "7891234567895",
  unidade: "JG",
  quantidadeVendida: "2",
  quantidadeJaDevolvida: "0",
  precoUnitario: "150",
  descontoCentavos: 1000,
  numeroItemNota: 1,
  retrato: {
    cfop: "5102",
    cstIcms: "00",
    aliquotaIcms: 18,
    cstPis: "04",
    cstCofins: "04",
    monofasico: true,
    cstIbsCbs: "000",
    cClassTrib: "000001",
    ncm: "87083090",
    cest: "0100100",
    origem: 0,
  },
  produto: { ncm: "87083090", cest: "0100100", origemFiscal: 0 },
};

function dadosDevolucao(itens: DadosNota["itens"]): DadosNota {
  return {
    modelo: "55",
    finalidade: 4,
    tipoDocumento: 0,
    natureza: "DEVOLUCAO DE VENDA",
    dataEmissao: DATA,
    emitente: { cnpj: CNPJ, inscricaoEstadual: "123456789012", uf: "SP", regime: "LUCRO_PRESUMIDO" },
    destinatario: {
      cpfCnpj: "12345678909",
      nome: "Cliente Teste",
      endereco: { logradouro: "Rua A", numero: "100", bairro: "Centro", municipio: "Cotia", uf: "SP", cep: "06700000" },
    },
    itens,
    pagamentos: [],
    presenca: "NAO_SE_APLICA",
    notasReferenciadas: [CHAVE],
  };
}

describe("cfopDevolucao", () => {
  it("mapeia venda → devolução (tabela CFOP)", () => {
    expect(cfopDevolucao("5102")).toBe("1202");
    expect(cfopDevolucao("6102")).toBe("2202");
    expect(cfopDevolucao("5405")).toBe("1411");
    expect(cfopDevolucao("6404")).toBe("2411");
    expect(cfopDevolucao("5949")).toBeNull();
  });
});

describe("NF-e de devolução referenciada por item (Rej. 321 desde 03/11/2026)", () => {
  it("golden: 1 de 2 pastilhas, refNFe + DFeReferenciado no item, tributação espelhada", () => {
    const { itens, erros } = montarItensDevolucao({ chaveOriginal: CHAVE, itens: [{ original, quantidade: 1 }] });
    expect(erros).toEqual([]);
    const r = montarNota(dadosDevolucao(itens));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 1 × 150,00; desconto proporcional 10,00 × 1/2 = 5,00 → BC 145,00
    // ICMS 18% = 26,10; PIS/COFINS 04 = 0; BC IBS/CBS = 145 − 26,10 = 118,90
    // CBS 0,9% = 1,0701 → 1,07; IBS UF 0,1% = 0,1189 → 0,12
    expect(r.totais).toMatchObject({
      produtosCentavos: 15000,
      descontoCentavos: 500,
      icmsCentavos: 2610,
      cbsCentavos: 107,
      ibsCentavos: 12,
      totalCentavos: 14500,
    });
    expect(r.payload).toEqual({
      natureza_operacao: "DEVOLUCAO DE VENDA",
      data_emissao: "2026-11-04T13:00:00.000Z",
      tipo_documento: "0",
      finalidade_emissao: "4",
      local_destino: "1",
      consumidor_final: "1",
      presenca_comprador: "0",
      regime_tributario_emitente: "3",
      cnpj_emitente: CNPJ,
      nome_destinatario: "Cliente Teste",
      modalidade_frete: "9",
      cpf_destinatario: "12345678909",
      indicador_inscricao_estadual_destinatario: "9",
      logradouro_destinatario: "Rua A",
      numero_destinatario: "100",
      bairro_destinatario: "Centro",
      municipio_destinatario: "Cotia",
      uf_destinatario: "SP",
      cep_destinatario: "06700000",
      notas_referenciadas: [{ chave_nfe: CHAVE }],
      items: [
        {
          numero_item: 1,
          codigo_produto: "PAST-001",
          codigo_barras_comercial: "7891234567895",
          codigo_barras_tributavel: "7891234567895",
          descricao: "Pastilha de freio dianteira",
          codigo_ncm: "87083090",
          cfop: "1202",
          unidade_comercial: "JG",
          quantidade_comercial: 1,
          valor_unitario_comercial: 150,
          unidade_tributavel: "JG",
          quantidade_tributavel: 1,
          valor_unitario_tributavel: 150,
          valor_bruto: 150,
          inclui_no_total: "1",
          icms_origem: "0",
          icms_situacao_tributaria: "00",
          pis_situacao_tributaria: "04",
          cofins_situacao_tributaria: "04",
          cest: "0100100",
          valor_desconto: 5,
          icms_modalidade_base_calculo: "3",
          icms_base_calculo: 145,
          icms_aliquota: 18,
          icms_valor: 26.1,
          ibs_cbs_situacao_tributaria: "000",
          ibs_cbs_classificacao_tributaria: "000001",
          ibs_cbs_base_calculo: 118.9,
          ibs_uf_aliquota: 0.1,
          ibs_uf_valor: 0.12,
          ibs_mun_aliquota: 0,
          ibs_mun_valor: 0,
          ibs_valor_total: 0.12,
          cbs_aliquota: 0.9,
          cbs_valor: 1.07,
          chave_acesso_dfe_referenciado: CHAVE,
          numero_item_dfe_referenciado: "1",
        },
      ],
      ibs_cbs_base_calculo: 118.9,
      ibs_uf_valor_total: 0.12,
      ibs_mun_valor_total: 0,
      ibs_valor_total: 0.12,
      cbs_valor_total: 1.07,
      formas_pagamento: [{ forma_pagamento: "90", valor_pagamento: 0 }],
    });
  });

  it("venda feita com ST (antes de 01/10/2026) volta com CSOSN 500 e CFOP 1411", () => {
    const { itens, erros } = montarItensDevolucao({
      chaveOriginal: CHAVE,
      itens: [{ original: { ...original, retrato: { ...original.retrato, cfop: "5405", cstIcms: "500" } }, quantidade: 1 }],
    });
    expect(erros).toEqual([]);
    expect(itens[0].cfopFixo).toBe("1411");
    const d = dadosDevolucao(itens);
    d.emitente.regime = "SIMPLES_NACIONAL";
    const r = montarNota(d);
    expect(r.ok).toBe(true);
  });

  it("não deixa devolver mais do que foi vendido", () => {
    const { erros } = montarItensDevolucao({
      chaveOriginal: CHAVE,
      itens: [{ original: { ...original, quantidadeJaDevolvida: "2" }, quantidade: 1 }],
    });
    expect(erros[0]).toContain("só 0 unidade(s)");
  });

  it("devolução sem referência é bloqueada pelo montador", () => {
    const { itens } = montarItensDevolucao({ chaveOriginal: CHAVE, itens: [{ original, quantidade: 1 }] });
    itens[0].referencia = null;
    const r = montarNota(dadosDevolucao(itens));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros.join(" ")).toContain("Rej. 321");
  });

  it("nota antiga sem nItem gravado: acha o item e a tributação no XML autorizado", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00"><NFe><infNFe Id="NFe${CHAVE}">
      <det nItem="1"><prod><cProd>OUTRO</cProd><NCM>63071000</NCM><CFOP>5102</CFOP><qCom>1.0000</qCom></prod>
        <imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><pICMS>18.00</pICMS></ICMS00></ICMS><PIS><PISAliq><CST>01</CST></PISAliq></PIS><COFINS><COFINSAliq><CST>01</CST></COFINSAliq></COFINS></imposto></det>
      <det nItem="2"><prod><cProd>PAST-001</cProd><NCM>87083090</NCM><CEST>0100100</CEST><CFOP>5102</CFOP><qCom>2.0000</qCom></prod>
        <imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><pICMS>18.00</pICMS></ICMS00></ICMS><PIS><PISNT><CST>04</CST></PISNT></PIS><COFINS><COFINSNT><CST>04</CST></COFINSNT></COFINS></imposto></det>
      </infNFe></NFe></nfeProc>`;
    const { itens, erros } = montarItensDevolucao({
      chaveOriginal: CHAVE,
      xmlOriginal: xml,
      itens: [{ original: { ...original, numeroItemNota: null, retrato: null }, quantidade: 1 }],
    });
    expect(erros).toEqual([]);
    expect(itens[0].referencia).toEqual({ chave: CHAVE, nItem: 2 });
    expect(itens[0].cfopFixo).toBe("1202");
    expect(itens[0].cstIcms).toBe("00");
    expect(itens[0].cstPis).toBe("04");
  });
});

describe("itensDoXmlNfe — ST por item (base da CAT 28/2020)", () => {
  it("lê vBCSTRet / vICMSSTRet do CSOSN 500", () => {
    const xml = `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe1"><det nItem="1"><prod><cProd>X1</cProd><NCM>87083090</NCM><CEST>0100100</CEST><CFOP>5405</CFOP><qCom>10</qCom></prod>
      <imposto><ICMS><ICMSSN500><orig>0</orig><CSOSN>500</CSOSN><vBCSTRet>500.00</vBCSTRet><pST>18.00</pST><vICMSSubstituto>30.00</vICMSSubstituto><vICMSSTRet>60.00</vICMSSTRet></ICMSSN500></ICMS></imposto></det></infNFe></NFe></nfeProc>`;
    const [i] = itensDoXmlNfe(xml);
    expect(i).toMatchObject({ nItem: 1, cProd: "X1", cstIcms: "500", vBcStRet: 500, vIcmsStRet: 60, vIcmsSubstituto: 30, quantidade: 10 });
  });
});

describe("pedido de devolução: item repetido e ref determinístico", () => {
  it("soma o mesmo item pedido duas vezes (2 vendidas, [{iv,2},{iv,2}] → 4, bloqueia)", () => {
    const pedidos = agruparPedidos([
      { itemVendaId: "iv1", quantidade: 2 },
      { itemVendaId: "iv1", quantidade: 2 },
    ]);
    expect(pedidos).toEqual([{ itemVendaId: "iv1", quantidade: 4 }]);
    const { itens, erros } = montarItensDevolucao({
      chaveOriginal: CHAVE,
      itens: pedidos.map((p) => ({ original, quantidade: p.quantidade })),
    });
    expect(itens).toEqual([]);
    expect(erros[0]).toContain("só 2 unidade(s)");
  });
  it("soma em milésimos sem erro de float (0,1 + 0,2 = 0,3)", () => {
    expect(agruparPedidos([{ itemVendaId: "b", quantidade: 0.1 }, { itemVendaId: "a", quantidade: 1 }, { itemVendaId: "b", quantidade: 0.2 }]))
      .toEqual([{ itemVendaId: "a", quantidade: 1 }, { itemVendaId: "b", quantidade: 0.3 }]);
  });
  it("o montador recusa o mesmo item duas vezes, mesmo que caiba", () => {
    const { erros } = montarItensDevolucao({
      chaveOriginal: CHAVE,
      itens: [{ original, quantidade: 1 }, { original, quantidade: 1 }],
    });
    expect(erros[0]).toContain("mais de uma vez");
  });
  it("ref: mesmo pedido → mesmo ref; ordem não importa; já devolvido diferente → outro ref", () => {
    const base = { empresaId: "E", vendaId: "V", itens: [{ itemVendaId: "a", quantidade: 1, jaDevolvidoAntes: "0" }, { itemVendaId: "b", quantidade: 2, jaDevolvidoAntes: 0 }] };
    const r1 = refDevolucao(base);
    expect(r1).toMatch(/^devolucao-[0-9a-f]{32}$/);
    expect(refDevolucao({ ...base, itens: [...base.itens].reverse() })).toBe(r1);
    expect(refDevolucao({ ...base, itens: [{ ...base.itens[0], jaDevolvidoAntes: "1.000" }, base.itens[1]] })).not.toBe(r1);
    expect(refDevolucao({ ...base, rmaId: "R" })).not.toBe(r1);
    expect(refDevolucao({ ...base, itens: [{ ...base.itens[0], quantidade: 2 }, base.itens[1]] })).not.toBe(r1);
  });
});
