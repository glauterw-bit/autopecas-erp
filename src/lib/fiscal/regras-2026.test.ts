import { describe, it, expect } from "vitest";
import { aplicarAliquota, multiplicarQtdPreco, ratear, reaisParaCentavos } from "./centavos";
import { calcularItemFiscal, calcularPisCofins } from "./calculo";
import { calcularIbsCbsItem, ibsCbsObrigatorio } from "./ibs-cbs";
import { resolverPisCofins } from "./pis-cofins";
import { ehAutopeca, erroStAutopecaSp, erroStSemCestSp, sugerirTributacaoPosSt } from "./st-sp";

describe("centavos", () => {
  it("converte e arredonda meio para cima", () => {
    expect(reaisParaCentavos("89.9000")).toBe(8990);
    expect(reaisParaCentavos("0.005")).toBe(1);
    expect(reaisParaCentavos(12.345)).toBe(1235);
    expect(aplicarAliquota(15800, 18)).toBe(2844);
    expect(aplicarAliquota(3800, 0.65)).toBe(25); // 24,7 → 25
    expect(aplicarAliquota(12956, 0.9)).toBe(117); // 116,604 → 117
    expect(multiplicarQtdPreco("1.5", "33.3333")).toBe(5000); // 49,99995 → 50,00
    expect(ratear(1000, [15000, 3750])).toEqual([800, 200]);
    expect(ratear(100, [1, 1, 1])).toEqual([33, 33, 34]);
  });
});

describe("fim da ST de autopeças em SP (Portaria SRE 34/2026)", () => {
  const pastilha = { ncm: "87083090", cest: "0100100", nome: "Pastilha", sku: "P1" };
  it("autopeça: CEST segmento 01 ou, sem CEST, NCM 8708", () => {
    expect(ehAutopeca({ cest: "01.001.00" })).toBe(true);
    expect(ehAutopeca({ cest: "1600100", ncm: "40111000" })).toBe(false); // pneu: revisão manual
    expect(ehAutopeca({ ncm: "8708.99.90" })).toBe(true);
    expect(ehAutopeca({ ncm: "84212300" })).toBe(false);
  });
  it("vale pela data da operação, no fuso de Brasília", () => {
    const base = { ufEmitente: "SP", ufDestino: "SP", produto: pastilha, cstUsado: "500", cfopUsado: "5405" };
    // 30/09/2026 23:59 em Brasília = 01/10 02:59 UTC → ainda com ST
    expect(erroStAutopecaSp({ ...base, dataOperacao: new Date("2026-10-01T02:59:00Z") })).toBeNull();
    expect(erroStAutopecaSp({ ...base, dataOperacao: new Date("2026-10-01T03:00:00Z") })).toContain("01/10/2026");
    // venda para fora de SP: a regra de SP não decide (ST pode existir no destino)
    expect(erroStAutopecaSp({ ...base, ufDestino: "MG", dataOperacao: new Date("2026-11-04T12:00:00Z") })).toBeNull();
  });
  it("sugestão pós-ST por regime", () => {
    expect(sugerirTributacaoPosSt("SIMPLES_NACIONAL")).toEqual({ cstIcms: "102", cfopVendaInterna: "5102" });
    expect(sugerirTributacaoPosSt("LUCRO_REAL")).toEqual({ cstIcms: "00", cfopVendaInterna: "5102" });
  });
  it("calcularItemFiscal ignora a MVA depois de 01/10/2026 e mantém antes", () => {
    const item = {
      valorProdutos: 1000, ufOrigem: "SP", ufDestino: "SP", origemFiscal: 0, cstIcms: "00",
      mvaSt: 71.78, regime: "LUCRO_PRESUMIDO" as const, consumidorFinal: true, contribuinteIcms: false,
      ncm: "87083090", cest: "0100100",
    };
    const depois = calcularItemFiscal({ ...item, dataOperacao: new Date("2026-11-04T12:00:00Z") });
    expect(depois.st.valorIcmsSt).toBe(0);
    expect(depois.avisos[0]).toContain("Portaria SRE 34/2026");
    const antes = calcularItemFiscal({ ...item, dataOperacao: new Date("2026-09-15T12:00:00Z") });
    expect(antes.st.valorIcmsSt).toBeGreaterThan(0);
  });
});

describe("PIS/COFINS por produto (Lei 10.485/2002)", () => {
  it("monofásico = CST 04 e zero em qualquer regime", () => {
    for (const regime of ["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL"] as const) {
      const r = resolverPisCofins({ regime, baseCentavos: 10000, monofasico: true });
      expect([r.cstPis, r.cstCofins, r.pisCentavos, r.cofinsCentavos]).toEqual(["04", "04", 0, 0]);
    }
  });
  it("Presumido 0,65% + 3% e Real 1,65% + 7,6% sobre R$ 100,00", () => {
    const p = resolverPisCofins({ regime: "LUCRO_PRESUMIDO", baseCentavos: 10000 });
    expect([p.cstPis, p.pisCentavos, p.cofinsCentavos]).toEqual(["01", 65, 300]);
    const r = resolverPisCofins({ regime: "LUCRO_REAL", baseCentavos: 10000 });
    expect([r.pisCentavos, r.cofinsCentavos]).toEqual([165, 760]);
  });
  it("Simples: CST padrão 49 (configurável) e CST do produto prevalece", () => {
    expect(resolverPisCofins({ regime: "SIMPLES_NACIONAL", baseCentavos: 10000 }).cstPis).toBe("49");
    expect(resolverPisCofins({ regime: "SIMPLES_NACIONAL", baseCentavos: 10000, cstSimplesPadrao: "99" }).cstPis).toBe("99");
    expect(resolverPisCofins({ regime: "LUCRO_PRESUMIDO", baseCentavos: 10000, cstPis: "06", cstCofins: "06" }).pisCentavos).toBe(0);
  });
  it("o cálculo antigo também respeita o monofásico", () => {
    expect(calcularPisCofins({ baseCalculo: 1000, regime: "LUCRO_REAL", monofasico: true })).toEqual({ pis: 0, cofins: 0 });
  });
});

describe("IBS/CBS — obrigatoriedade e cálculo", () => {
  it("regime normal desde 03/08/2026; Simples a partir de 01/01/2027", () => {
    expect(ibsCbsObrigatorio("LUCRO_PRESUMIDO", new Date("2026-08-02T12:00:00Z"))).toBe(false);
    expect(ibsCbsObrigatorio("LUCRO_PRESUMIDO", new Date("2026-08-03T12:00:00Z"))).toBe(true);
    expect(ibsCbsObrigatorio("SIMPLES_NACIONAL", new Date("2026-12-31T12:00:00Z"))).toBe(false);
    expect(ibsCbsObrigatorio("SIMPLES_NACIONAL", new Date("2027-01-01T12:00:00Z"))).toBe(true);
  });
  it("CST 410 manda só CST e cClassTrib, sem valores", () => {
    const r = calcularIbsCbsItem({
      regime: "LUCRO_REAL", data: new Date("2026-11-04T12:00:00Z"), produtoNome: "X",
      cstProduto: "410", cClassTribProduto: "410001", valorProdutosCentavos: 10000,
      freteCentavos: 0, descontoCentavos: 0, icmsCentavos: 0, pisCentavos: 0, cofinsCentavos: 0,
    });
    expect("enviar" in r && r.enviar && r.item.comValores).toBe(false);
  });
  it("alíquota de 2027 cadastrada pela empresa destrava a emissão", () => {
    const r = calcularIbsCbsItem({
      regime: "LUCRO_REAL", data: new Date("2027-02-01T12:00:00Z"), produtoNome: "X",
      cstProduto: "000", cClassTribProduto: "000001",
      config: { aliquotas: { "2027": { cbs: 8.7, ibsUf: 0.1, ibsMun: 0, fonte: "teste" } } },
      valorProdutosCentavos: 10000, freteCentavos: 0, descontoCentavos: 0, icmsCentavos: 1800, pisCentavos: 0, cofinsCentavos: 0,
    });
    // BC = 100 − 18 = 82,00; CBS 8,7% = 7,134 → 7,13
    expect("enviar" in r && r.enviar && r.item.cbsCentavos).toBe(713);
  });
});

describe("ST sem CEST em SP depois de 01/10/2026 (bloqueia: não dá para saber se ainda tem ST)", () => {
  const depois = new Date("2026-11-04T12:00:00Z");
  const base = { ufEmitente: "SP", dataOperacao: depois, cstUsado: "60", cfopUsado: "5405" };
  it("filtro (8421), vela (8511) e rolamento (8482) com ST e sem CEST: bloqueia", () => {
    for (const [sku, cst, cfop] of [["FILTRO", "60", "5405"], ["VELA", "500", "5102"], ["ROLAM", "102", "5405"]]) {
      const msg = erroStSemCestSp({ ...base, cstUsado: cst, cfopUsado: cfop, produto: { sku, nome: sku, cest: null } });
      expect(msg).toContain("não tem CEST");
      expect(msg).toContain("Revise o cadastro");
    }
  });
  it("com CEST, sem ST, fora de SP ou antes de 01/10/2026: não bloqueia por esta regra", () => {
    expect(erroStSemCestSp({ ...base, produto: { cest: "01.001.00" } })).toBeNull();
    expect(erroStSemCestSp({ ...base, cstUsado: "00", cfopUsado: "5102", produto: { cest: null } })).toBeNull();
    expect(erroStSemCestSp({ ...base, ufEmitente: "MG", produto: { cest: null } })).toBeNull();
    expect(erroStSemCestSp({ ...base, dataOperacao: new Date("2026-10-01T02:59:00Z"), produto: { cest: null } })).toBeNull();
    expect(erroStSemCestSp({ ...base, dataOperacao: new Date("2026-10-01T03:00:00Z"), produto: { cest: "" } })).not.toBeNull();
  });
});
