import { describe, it, expect } from "vitest";
import { montarNota, type DadosNota, type ItemEntradaNota } from "./payload";

// Golden do JSON enviado à Focus NFe. Valores calculados à mão, em centavos,
// arredondamento meio para cima por item. Data fixa: 04/11/2026 10:00 (Brasília).
// O CEST "0100100" abaixo é só formato válido do segmento 01 (autopeças) para
// teste — não é a classificação oficial de pastilha.

const DATA = new Date("2026-11-04T13:00:00.000Z");
const CNPJ = "12345678000195";

const pastilha: ItemEntradaNota = {
  sku: "PAST-001",
  codigoBarras: "7891234567895",
  nome: "Pastilha de freio dianteira",
  ncm: "8708.30.90",
  cest: "0100100",
  unidade: "JG",
  quantidade: "2",
  valorUnitario: "89.9000",
  descontoCentavos: 500,
  origem: 0,
  cstIcms: "102",
  cfopInterna: "5102",
  cfopInterestadual: "6102",
  monofasico: true,
};

function nfceSimples(over: Partial<DadosNota> = {}, item: Partial<ItemEntradaNota> = {}): DadosNota {
  return {
    modelo: "65",
    finalidade: 1,
    tipoDocumento: 1,
    natureza: "VENDA",
    dataEmissao: DATA,
    emitente: { cnpj: CNPJ, inscricaoEstadual: "123456789012", uf: "SP", regime: "SIMPLES_NACIONAL" },
    destinatario: { nome: "Consumidor Final" },
    itens: [{ ...pastilha, ...item }],
    pagamentos: [{ forma: "PIX", valorCentavos: 17480 }],
    presenca: "PRESENCIAL",
    ...over,
  };
}

describe("NFC-e Simples SP — pastilha de freio (NCM 8708.30)", () => {
  it("golden: CSOSN 102, CFOP 5102, PIS/COFINS 04 monofásico, sem IBS/CBS em 2026", () => {
    const r = montarNota(nfceSimples());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 2 × 89,90 = 179,80; desconto 5,00 → total 174,80
    expect(r.totais).toEqual({
      produtosCentavos: 17980,
      descontoCentavos: 500,
      freteCentavos: 0,
      icmsCentavos: 0,
      pisCentavos: 0,
      cofinsCentavos: 0,
      ibsCentavos: 0,
      cbsCentavos: 0,
      totalCentavos: 17480,
    });
    expect(r.payload).toEqual({
      natureza_operacao: "VENDA",
      data_emissao: "2026-11-04T13:00:00.000Z",
      tipo_documento: "1",
      finalidade_emissao: "1",
      local_destino: "1",
      consumidor_final: "1",
      presenca_comprador: "1",
      regime_tributario_emitente: "1",
      cnpj_emitente: CNPJ,
      nome_destinatario: "Consumidor Final",
      modalidade_frete: "9",
      items: [
        {
          numero_item: 1,
          codigo_produto: "PAST-001",
          codigo_barras_comercial: "7891234567895",
          codigo_barras_tributavel: "7891234567895",
          descricao: "Pastilha de freio dianteira",
          codigo_ncm: "87083090",
          cfop: "5102",
          unidade_comercial: "JG",
          quantidade_comercial: 2,
          valor_unitario_comercial: 89.9,
          unidade_tributavel: "JG",
          quantidade_tributavel: 2,
          valor_unitario_tributavel: 89.9,
          valor_bruto: 179.8,
          inclui_no_total: "1",
          icms_origem: "0",
          icms_situacao_tributaria: "102",
          pis_situacao_tributaria: "04",
          cofins_situacao_tributaria: "04",
          cest: "0100100",
          valor_desconto: 5,
        },
      ],
      formas_pagamento: [{ forma_pagamento: "17", valor_pagamento: 174.8 }],
    });
  });

  it("bloqueia CSOSN 500 / CFOP 5405 em autopeça de SP depois de 01/10/2026", () => {
    const r = montarNota(nfceSimples({}, { cstIcms: "500", cfopInterna: "5405" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros.join(" ")).toContain("Portaria SRE 34/2026");
  });

  it("aceita CSOSN 500 / CFOP 5405 numa venda de 30/09/2026 (ainda com ST)", () => {
    const r = montarNota(
      nfceSimples({ dataEmissao: new Date("2026-09-30T20:00:00.000Z") }, { cstIcms: "500", cfopInterna: "5405" }),
    );
    expect(r.ok).toBe(true);
  });

  it("Simples sem monofásico usa CST 49 com base e valor zerados", () => {
    const r = montarNota(nfceSimples({}, { monofasico: false }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const item = (r.payload.items as Record<string, unknown>[])[0];
    expect(item.pis_situacao_tributaria).toBe("49");
    expect(item.pis_valor).toBe(0);
    expect(item.cofins_valor).toBe(0);
  });
});

describe("produto sem NCM bloqueia a emissão", () => {
  it("NCM vazio", () => {
    const r = montarNota(nfceSimples({}, { ncm: null }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros).toEqual([
      "Item 1 (PAST-001 — Pastilha de freio dianteira): falta o NCM (8 dígitos). Sem NCM a SEFAZ rejeita a nota. Cadastre no produto.",
    ]);
  });
  it('NCM "00000000" também bloqueia (antes o emissor mandava isso)', () => {
    const r = montarNota(nfceSimples({}, { ncm: "00000000" }));
    expect(r.ok).toBe(false);
  });
  it("outros obrigatórios: CSOSN, CFOP e pagamento", () => {
    const r = montarNota(
      nfceSimples({ pagamentos: [] }, { cstIcms: null, cfopInterna: "1102" }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros.some((e) => e.includes("falta CSOSN"))).toBe(true);
    expect(r.erros.some((e) => e.includes("CFOP 1102"))).toBe(true);
    expect(r.erros.some((e) => e.includes("Pagamentos"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------

const flanela: ItemEntradaNota = {
  sku: "FLA-010",
  codigoBarras: null,
  nome: "Flanela de limpeza",
  ncm: "63071000",
  cest: null,
  unidade: "UN",
  quantidade: "3",
  valorUnitario: "12.50",
  descontoCentavos: 150,
  origem: 0,
  cstIcms: "00",
  cfopInterna: "5102",
  monofasico: false,
};

function nfeNormal(over: Partial<DadosNota> = {}): DadosNota {
  return {
    modelo: "55",
    finalidade: 1,
    tipoDocumento: 1,
    natureza: "VENDA",
    dataEmissao: DATA,
    emitente: {
      cnpj: CNPJ,
      inscricaoEstadual: "123456789012",
      uf: "SP",
      regime: "LUCRO_PRESUMIDO",
      config: { ibsCbs: { cst: "000", cClassTrib: "000001" } },
    },
    destinatario: {
      cpfCnpj: "123.456.789-09",
      nome: "Cliente Teste",
      endereco: {
        logradouro: "Rua A",
        numero: "100",
        bairro: "Centro",
        municipio: "Taboão da Serra",
        uf: "SP",
        cep: "06750-000",
      },
    },
    itens: [
      {
        ...pastilha,
        quantidade: "1",
        valorUnitario: "150",
        descontoCentavos: 0,
        cstIcms: "00",
        cstIbsCbs: "000",
        cClassTrib: "000001",
      },
      flanela,
    ],
    freteCentavos: 1000,
    pagamentos: [{ forma: "BOLETO", valorCentavos: 19600 }],
    presenca: "INTERNET",
    ...over,
  };
}

describe("NF-e regime normal (Lucro Presumido) com IBS/CBS — 04/11/2026", () => {
  it("golden: ICMS 18%, PIS/COFINS por produto, IBS/CBS 2026 (CBS 0,9%, IBS UF 0,1%)", () => {
    const r = montarNota(nfeNormal());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Frete 10,00 rateado por valor: 150,00 e 37,50 → 8,00 e 2,00.
    // Pastilha: BC ICMS 158,00 × 18% = 28,44; PIS/COFINS 04 (monofásico) = 0;
    //   BC IBS/CBS = 150 + 8 − 28,44 = 129,56; CBS 0,9% = 1,16604 → 1,17; IBS UF 0,1% = 0,12956 → 0,13.
    // Flanela: 3 × 12,50 = 37,50 − 1,50 + 2,00 = BC 38,00; ICMS 6,84;
    //   PIS 0,65% = 0,247 → 0,25; COFINS 3% = 1,14;
    //   BC IBS/CBS = 37,50 + 2 − 1,50 − 6,84 − 0,25 − 1,14 = 29,77; CBS 0,26793 → 0,27; IBS UF 0,02977 → 0,03.
    expect(r.totais).toEqual({
      produtosCentavos: 18750,
      descontoCentavos: 150,
      freteCentavos: 1000,
      icmsCentavos: 3528,
      pisCentavos: 25,
      cofinsCentavos: 114,
      ibsCentavos: 16,
      cbsCentavos: 144,
      totalCentavos: 19600, // 2026: IBS/CBS fora do total
    });
    expect(r.payload).toEqual({
      natureza_operacao: "VENDA",
      data_emissao: "2026-11-04T13:00:00.000Z",
      tipo_documento: "1",
      finalidade_emissao: "1",
      local_destino: "1",
      consumidor_final: "1",
      presenca_comprador: "2",
      regime_tributario_emitente: "3",
      cnpj_emitente: CNPJ,
      nome_destinatario: "Cliente Teste",
      modalidade_frete: "0",
      cpf_destinatario: "12345678909",
      indicador_inscricao_estadual_destinatario: "9",
      logradouro_destinatario: "Rua A",
      numero_destinatario: "100",
      bairro_destinatario: "Centro",
      municipio_destinatario: "Taboão da Serra",
      uf_destinatario: "SP",
      cep_destinatario: "06750000",
      items: [
        {
          numero_item: 1,
          codigo_produto: "PAST-001",
          codigo_barras_comercial: "7891234567895",
          codigo_barras_tributavel: "7891234567895",
          descricao: "Pastilha de freio dianteira",
          codigo_ncm: "87083090",
          cfop: "5102",
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
          valor_frete: 8,
          icms_modalidade_base_calculo: "3",
          icms_base_calculo: 158,
          icms_aliquota: 18,
          icms_valor: 28.44,
          ibs_cbs_situacao_tributaria: "000",
          ibs_cbs_classificacao_tributaria: "000001",
          ibs_cbs_base_calculo: 129.56,
          ibs_uf_aliquota: 0.1,
          ibs_uf_valor: 0.13,
          ibs_mun_aliquota: 0,
          ibs_mun_valor: 0,
          ibs_valor_total: 0.13,
          cbs_aliquota: 0.9,
          cbs_valor: 1.17,
        },
        {
          numero_item: 2,
          codigo_produto: "FLA-010",
          codigo_barras_comercial: "SEM GTIN",
          codigo_barras_tributavel: "SEM GTIN",
          descricao: "Flanela de limpeza",
          codigo_ncm: "63071000",
          cfop: "5102",
          unidade_comercial: "UN",
          quantidade_comercial: 3,
          valor_unitario_comercial: 12.5,
          unidade_tributavel: "UN",
          quantidade_tributavel: 3,
          valor_unitario_tributavel: 12.5,
          valor_bruto: 37.5,
          inclui_no_total: "1",
          icms_origem: "0",
          icms_situacao_tributaria: "00",
          pis_situacao_tributaria: "01",
          cofins_situacao_tributaria: "01",
          valor_desconto: 1.5,
          valor_frete: 2,
          icms_modalidade_base_calculo: "3",
          icms_base_calculo: 38,
          icms_aliquota: 18,
          icms_valor: 6.84,
          pis_base_calculo: 38,
          pis_aliquota_porcentual: 0.65,
          pis_valor: 0.25,
          cofins_base_calculo: 38,
          cofins_aliquota_porcentual: 3,
          cofins_valor: 1.14,
          ibs_cbs_situacao_tributaria: "000",
          ibs_cbs_classificacao_tributaria: "000001",
          ibs_cbs_base_calculo: 29.77,
          ibs_uf_aliquota: 0.1,
          ibs_uf_valor: 0.03,
          ibs_mun_aliquota: 0,
          ibs_mun_valor: 0,
          ibs_valor_total: 0.03,
          cbs_aliquota: 0.9,
          cbs_valor: 0.27,
        },
      ],
      ibs_cbs_base_calculo: 159.33,
      ibs_uf_valor_total: 0.16,
      ibs_mun_valor_total: 0,
      ibs_valor_total: 0.16,
      cbs_valor_total: 1.44,
      formas_pagamento: [{ forma_pagamento: "15", valor_pagamento: 196 }],
    });
  });

  it("bloqueia regime normal sem CST/cClassTrib de IBS/CBS (produto nem empresa)", () => {
    const d = nfeNormal();
    d.emitente.config = {};
    const r = montarNota(d);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0]).toContain("FLA-010");
    expect(r.erros[0]).toContain("Ato Conjunto RFB/CGIBS 4/2026");
  });

  it("bloqueia em 2027 enquanto a alíquota oficial não estiver cadastrada", () => {
    const r = montarNota(nfeNormal({ dataEmissao: new Date("2027-01-04T13:00:00.000Z") }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros[0]).toContain("Não há alíquota de IBS/CBS definida");
  });

  it("NF-e exige CPF/CNPJ e endereço completo do cliente", () => {
    const r = montarNota(nfeNormal({ destinatario: { nome: "Sem cadastro" } }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros.some((e) => e.includes("CPF ou CNPJ"))).toBe(true);
    expect(r.erros.some((e) => e.includes("Endereço do cliente incompleto"))).toBe(true);
  });

  it("regime normal com CSOSN (3 dígitos) bloqueia com explicação", () => {
    const d = nfeNormal();
    d.itens[1] = { ...flanela, cstIcms: "102" };
    const r = montarNota(d);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros.join(" ")).toContain("use CST (2 dígitos)");
  });
});

describe("emissão: filtro sem CEST com CSOSN 500/CFOP 5405 em SP depois de 01/10/2026", () => {
  it("bloqueia a nota e pede revisão do cadastro (NCM 8421 não é pego pela regra do 8708)", () => {
    const r = montarNota(
      nfceSimples({}, { sku: "FILT-01", nome: "Filtro de óleo", ncm: "84212300", cest: null, cstIcms: "500", cfopInterna: "5405" }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros.join(" ")).toContain("FILT-01 (Filtro de óleo) está como venda com substituição tributária");
    expect(r.erros.join(" ")).toContain("não tem CEST");
  });
  it("o mesmo filtro com CSOSN 102/CFOP 5102 e sem CEST passa por esta regra", () => {
    const r = montarNota(
      nfceSimples({}, { sku: "FILT-01", nome: "Filtro de óleo", ncm: "84212300", cest: null, cstIcms: "102", cfopInterna: "5102" }),
    );
    expect(r.ok ? [] : r.erros.filter((e) => e.includes("CEST"))).toEqual([]);
  });
});

describe("CST/CSOSN padrão da empresa (Configurações > Fiscal)", () => {
  const comPadrao = (cst: string) => ({
    emitente: {
      cnpj: CNPJ, inscricaoEstadual: "123456789012", uf: "SP", regime: "SIMPLES_NACIONAL" as const,
      config: { cstIcmsPadrao: cst },
    },
  });
  it("produto sem CSOSN usa o padrão da loja; valores iguais ao golden (17480 centavos)", () => {
    const r = montarNota(nfceSimples(comPadrao("102"), { cstIcms: null }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itens[0].cstIcms).toBe("102");
    expect(r.totais.totalCentavos).toBe(17480);
    expect((r.payload.items as Array<Record<string, unknown>>)[0].icms_situacao_tributaria).toBe("102");
  });
  it("cadastro do produto tem prioridade sobre o padrão", () => {
    const r = montarNota(nfceSimples(comPadrao("103"), { cstIcms: "102" }));
    expect(r.ok && r.itens[0].cstIcms).toBe("102");
  });
  it("padrão não aceito continua bloqueando (CST de regime normal numa empresa do Simples)", () => {
    const r = montarNota(nfceSimples(comPadrao("00"), { cstIcms: null }));
    expect(r.ok).toBe(false);
  });
});

describe("CST/CSOSN padrão restrito (revisão R5)", () => {
  const normalComPadrao = (cst: string, item: Partial<ItemEntradaNota> = {}) =>
    nfeNormal({
      emitente: { cnpj: CNPJ, inscricaoEstadual: "123456789012", uf: "SP", regime: "LUCRO_PRESUMIDO", config: { cstIcmsPadrao: cst, ibsCbs: { cst: "000", cClassTrib: "000001" } } },
      itens: [{ ...pastilha, quantidade: "1", valorUnitario: "150", descontoCentavos: 0, cstIcms: null, ...item }],
      freteCentavos: 0,
      pagamentos: [{ forma: "BOLETO", valorCentavos: 15000 }],
    });
  it("golden regime normal: padrão 00, 1 x R$ 150,00, ICMS 18% = 2700 centavos", () => {
    const r = montarNota(normalComPadrao("00"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itens[0].cstIcms).toBe("00");
    expect(r.totais.icmsCentavos).toBe(2700);
    expect(r.totais.produtosCentavos).toBe(15000);
  });
  it.each(["40", "41", "60"])("regime normal recusa padrão %s", (cst) => {
    const r = montarNota(normalComPadrao(cst));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.join(" ")).toContain("Isenção, não tributação e ST precisam estar no cadastro de cada produto");
  });
  it.each(["300", "400", "500"])("Simples recusa padrão %s", (cst) => {
    const r = montarNota(nfceSimples({ emitente: { cnpj: CNPJ, inscricaoEstadual: "123456789012", uf: "SP", regime: "SIMPLES_NACIONAL", config: { cstIcmsPadrao: cst } } }, { cstIcms: null }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.join(" ")).toContain("Isenção, não tributação e ST");
  });
  it("produto sem CST com CFOP de ST bloqueia em vez de aplicar o padrão", () => {
    const r = montarNota(nfceSimples({ emitente: { cnpj: CNPJ, inscricaoEstadual: "123456789012", uf: "SP", regime: "SIMPLES_NACIONAL", config: { cstIcmsPadrao: "102" } } }, { cstIcms: null, cfopInterna: "5405" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.join(" ")).toContain("substituição tributária");
  });
  it("produto COM CST próprio de ST continua passando por 500 no Simples (cadastro manda)", () => {
    const r = montarNota(nfceSimples({}, { cstIcms: "500", cfopInterna: "5405" }));
    expect(r.ok ? [] : r.erros.filter((e) => e.includes("padrão"))).toEqual([]);
  });
});
