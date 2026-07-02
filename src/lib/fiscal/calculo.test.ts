import { describe, it, expect } from "vitest";
import {
  aliquotaInterestadual,
  calcularIcms,
  calcularIcmsSt,
  calcularDifal,
  calcularPisCofins,
} from "./calculo";

describe("aliquotaInterestadual", () => {
  it("Sul/Sudeste → Norte/Nordeste = 7%", () => {
    expect(aliquotaInterestadual("SP", "BA")).toBe(7);
    expect(aliquotaInterestadual("MG", "CE")).toBe(7);
  });
  it("demais operações = 12%", () => {
    expect(aliquotaInterestadual("SP", "PR")).toBe(12);
    expect(aliquotaInterestadual("BA", "SP")).toBe(12);
  });
});

describe("calcularIcms", () => {
  it("operação interna SP usa 18%", () => {
    const r = calcularIcms({
      valorProdutos: 1000, ufOrigem: "SP", ufDestino: "SP",
      origemFiscal: 0, cstIcms: "00",
    });
    expect(r.aliquota).toBe(18);
    expect(r.valorIcms).toBeCloseTo(180, 2);
  });
  it("importado (origem 1) usa 4% interestadual", () => {
    const r = calcularIcms({
      valorProdutos: 1000, ufOrigem: "SP", ufDestino: "MG",
      origemFiscal: 1, cstIcms: "00",
    });
    expect(r.aliquota).toBe(4);
  });
  it("CST 40 (isenta) zera o imposto mas mantém base", () => {
    const r = calcularIcms({
      valorProdutos: 500, ufOrigem: "SP", ufDestino: "SP",
      origemFiscal: 0, cstIcms: "40",
    });
    expect(r.valorIcms).toBe(0);
    expect(r.baseCalculo).toBe(500);
  });
});

describe("calcularIcmsSt (autopeças MVA 71.78%)", () => {
  it("ajusta MVA quando interna > interestadual e calcula ST", () => {
    const r = calcularIcmsSt({
      valorOperacao: 1000,
      mvaOriginal: 71.78,
      aliquotaInterestadual: 12,
      aliquotaInterna: 18,
      icmsProprio: 120,
    });
    // MVA ajustada = ((1+0.7178) × (1−0.12)) / (1−0.18) − 1 = 84.35%
    expect(r.mvaAjustada).toBeCloseTo(84.35, 1);
    expect(r.baseSt).toBeCloseTo(1000 * (1 + 0.8435), 0);
    // ST = 18% da base ST − ICMS próprio
    expect(r.valorIcmsSt).toBeCloseTo(r.baseSt * 0.18 - 120, 1);
  });
  it("ST nunca fica negativo", () => {
    const r = calcularIcmsSt({
      valorOperacao: 100, mvaOriginal: 10,
      aliquotaInterestadual: 12, aliquotaInterna: 12, icmsProprio: 9999,
    });
    expect(r.valorIcmsSt).toBe(0);
  });
});

describe("calcularDifal", () => {
  it("só para consumidor final não contribuinte", () => {
    expect(
      calcularDifal({
        valorOperacao: 1000, aliquotaInterestadual: 12, aliquotaInternaDestino: 18,
        ufDestino: "BA", consumidorFinal: false, contribuinteIcms: false,
      }).total,
    ).toBe(0);
    expect(
      calcularDifal({
        valorOperacao: 1000, aliquotaInterestadual: 12, aliquotaInternaDestino: 18,
        ufDestino: "BA", consumidorFinal: true, contribuinteIcms: true,
      }).total,
    ).toBe(0);
  });
  it("DIFAL 6% + FCP 2% para BA", () => {
    const r = calcularDifal({
      valorOperacao: 1000, aliquotaInterestadual: 12, aliquotaInternaDestino: 18,
      ufDestino: "BA", consumidorFinal: true, contribuinteIcms: false,
    });
    expect(r.difal).toBeCloseTo(60, 2);
    expect(r.fcp).toBeCloseTo(20, 2);
    expect(r.total).toBeCloseTo(80, 2);
  });
});

describe("calcularPisCofins", () => {
  it("Simples Nacional = zero destacado", () => {
    const r = calcularPisCofins({ baseCalculo: 1000, regime: "SIMPLES_NACIONAL" });
    expect(r.pis + r.cofins).toBe(0);
  });
  it("Lucro Presumido cumulativo 0,65% + 3%", () => {
    const r = calcularPisCofins({ baseCalculo: 1000, regime: "LUCRO_PRESUMIDO" });
    expect(r.pis).toBeCloseTo(6.5, 2);
    expect(r.cofins).toBeCloseTo(30, 2);
  });
  it("Lucro Real não-cumulativo 1,65% + 7,6%", () => {
    const r = calcularPisCofins({ baseCalculo: 1000, regime: "LUCRO_REAL" });
    expect(r.pis).toBeCloseTo(16.5, 2);
    expect(r.cofins).toBeCloseTo(76, 2);
  });
});
