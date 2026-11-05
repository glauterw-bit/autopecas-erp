import { describe, it, expect } from "vitest";
import { calcularCreditoEstoque, classificarProdutoVirada, saldoNaData } from "./virada-st";
import { calcularDasSegregado } from "./simples-nacional";

describe("prévia da virada da ST", () => {
  const base = { id: "p1", sku: "P1", nome: "Pastilha", ncm: "87083090", cest: "0100100" };
  it("autopeça com CSOSN 500/5405 → AJUSTAR para 102/5102 (Simples), CEST mantido", () => {
    const l = classificarProdutoVirada({ ...base, cstIcms: "500", cfopVendaInterna: "5405", cfopVendaInterestadual: "6404" }, "SIMPLES_NACIONAL");
    expect(l?.situacao).toBe("AJUSTAR");
    expect(l?.depois).toEqual({ cstIcms: "102", cfopVendaInterna: "5102" });
    expect(l?.cest).toBe("0100100");
    expect(l?.aviso).toContain("6404");
  });
  it("regime normal: CST 60 → 00", () => {
    const l = classificarProdutoVirada({ ...base, cstIcms: "60", cfopVendaInterna: "5405" }, "LUCRO_PRESUMIDO");
    expect(l?.depois).toEqual({ cstIcms: "00", cfopVendaInterna: "5102" });
  });
  it("pneu (CEST 16) com ST → revisar à mão; produto já ajustado → fora da lista", () => {
    expect(classificarProdutoVirada({ ...base, ncm: "40111000", cest: "1600100", cstIcms: "500", cfopVendaInterna: "5405" }, "SIMPLES_NACIONAL")?.situacao).toBe("REVISAR_MANUAL");
    expect(classificarProdutoVirada({ ...base, cstIcms: "102", cfopVendaInterna: "5102" }, "SIMPLES_NACIONAL")).toBeNull();
  });
});

describe("estoque de 30/09/2026 (CAT 28/2020) — só relatório", () => {
  it("saldo na data desfaz os movimentos posteriores", () => {
    // hoje 7; depois de 30/09 entraram 5 e saíram 8 → em 30/09 havia 10
    expect(saldoNaData(7, [{ tipo: "ENTRADA", quantidade: 5 }, { tipo: "SAIDA", quantidade: 8 }, { tipo: "RESERVA", quantidade: 3 }])).toBe(10);
  });
  it("usa as entradas mais recentes até cobrir o estoque, ST proporcional", () => {
    // estoque 10. NF 300 (20/09): 6 un, ST 36,00 → usa 6 = 36,00
    // NF 200 (10/09): 8 un, ST 40,00 → usa 4 = 40,00 × 4/8 = 20,00. Total 56,00.
    const r = calcularCreditoEstoque(10, [
      { data: new Date("2026-09-10"), notaNumero: "200", chave: null, quantidade: 8, stCentavos: 4000 },
      { data: new Date("2026-09-20"), notaNumero: "300", chave: null, quantidade: 6, stCentavos: 3600 },
      { data: new Date("2026-08-01"), notaNumero: "100", chave: null, quantidade: 50, stCentavos: 9999 },
    ]);
    expect(r.stCentavos).toBe(5600);
    expect(r.notas.map((n) => [n.notaNumero, n.quantidadeUsada, n.stCentavos])).toEqual([["300", 6, 3600], ["200", 4, 2000]]);
    expect(r.quantidadeCoberta).toBe(10);
  });
  it("entrada sem ST = crédito zero; estoque sem nota fica descoberto", () => {
    const r = calcularCreditoEstoque(5, [{ data: new Date("2026-09-01"), notaNumero: "9", chave: null, quantidade: 2, stCentavos: 0 }]);
    expect(r.semSt).toBe(true);
    expect(r.quantidadeCoberta).toBe(2);
  });
});

describe("PGDAS-D com segregação (LC 123/2006 art. 18 § 4º-A)", () => {
  // Faixa 2 do Anexo I: PIS 2,76%, COFINS 12,74%, ICMS 34% da alíquota efetiva.
  const reparticao = { IRPJ: 5.5, CSLL: 3.5, COFINS: 12.74, PIS: 2.76, CPP: 41.5, ICMS: 34.0 };
  it("monofásico tira PIS+COFINS; ST tira ICMS", () => {
    const r = calcularDasSegregado({
      aliqEfetiva: 5,
      reparticao,
      itens: [
        { valorCentavos: 1_000_000, monofasico: false, st: false }, // 10.000 × 5% = 500,00
        { valorCentavos: 1_000_000, monofasico: true, st: false },  // 500 × (1 − 0,155) = 422,50
        { valorCentavos: 1_000_000, monofasico: false, st: true },  // 500 × (1 − 0,34) = 330,00
        { valorCentavos: 1_000_000, monofasico: true, st: true },   // 500 × (1 − 0,495) = 252,50
      ],
    });
    expect(r.dasCentavos).toBe(50000 + 42250 + 33000 + 25250);
    expect(r.dasSemSegregarCentavos).toBe(200000);
  });
});
