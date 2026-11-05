import { describe, it, expect } from "vitest";
import { classificarParado, estoqueParado, faixaParado } from "./estoque-parado";
import { multiplicarCentavos, paraCentavos } from "./dinheiro";

const hoje = new Date("2026-11-04T12:00:00Z");
const diasAtras = (n: number) => new Date(hoje.getTime() - n * 86_400_000);

describe("estoque parado 90/180/365", () => {
  it("faixas", () => {
    expect(faixaParado(89)).toBeNull();
    expect(faixaParado(90)).toBe(90);
    expect(faixaParado(179)).toBe(90);
    expect(faixaParado(180)).toBe(180);
    expect(faixaParado(364)).toBe(180);
    expect(faixaParado(365)).toBe(365);
  });

  it("sem saldo não entra", () => {
    expect(
      classificarParado({ produtoId: "a", estoque: 0, custoMedio: 10, ultimaVendaEm: null, referenciaSemVenda: diasAtras(400) }, hoje),
    ).toBeNull();
  });

  it("vendido há 100 dias: faixa 90 e valor imobilizado = saldo × custo médio", () => {
    const r = classificarParado(
      { produtoId: "a", estoque: 3, custoMedio: "45.3333", ultimaVendaEm: diasAtras(100), referenciaSemVenda: diasAtras(500) },
      hoje,
    );
    expect(r?.faixa).toBe(90);
    expect(r?.nuncaVendido).toBe(false);
    expect(r?.valorImobilizadoCentavos).toBe(13600); // 3 × 45,3333 = 135,9999 → R$ 136,00
  });

  it("nunca vendido conta a partir da última entrada", () => {
    const r = classificarParado(
      { produtoId: "b", estoque: 2, custoMedio: 100, ultimaVendaEm: null, referenciaSemVenda: diasAtras(200) },
      hoje,
    );
    expect(r?.faixa).toBe(180);
    expect(r?.nuncaVendido).toBe(true);
    expect(r?.valorImobilizadoCentavos).toBe(20000);
  });

  it("lista filtra pelo mínimo e soma por faixa em centavos", () => {
    const itens = [
      { produtoId: "a", estoque: 1, custoMedio: "10.005", ultimaVendaEm: diasAtras(95), referenciaSemVenda: diasAtras(95) },
      { produtoId: "b", estoque: 4, custoMedio: "250.10", ultimaVendaEm: diasAtras(190), referenciaSemVenda: diasAtras(190) },
      { produtoId: "c", estoque: 1.5, custoMedio: "80", ultimaVendaEm: null, referenciaSemVenda: diasAtras(400) },
      { produtoId: "d", estoque: 9, custoMedio: "5", ultimaVendaEm: diasAtras(10), referenciaSemVenda: diasAtras(400) },
    ];
    const r = estoqueParado(itens, 180, hoje);
    expect(r.lista.map((i) => i.produtoId)).toEqual(["b", "c"]);
    expect(r.totaisCentavos[90]).toBe(1001); // 10,005 → R$ 10,01
    expect(r.totaisCentavos[180]).toBe(100040);
    expect(r.totaisCentavos[365]).toBe(12000);
    expect(r.quantidades).toEqual({ 90: 1, 180: 1, 365: 1 });
  });
});

describe("dinheiro em centavos", () => {
  it("converte Decimal em string sem erro de float", () => {
    expect(paraCentavos("1.005")).toBe(101);
    expect(paraCentavos("0.1")).toBe(10);
    expect(paraCentavos("-2.50")).toBe(-250);
    expect(paraCentavos(null)).toBe(0);
  });
  it("multiplica quantidade × preço e arredonda no centavo", () => {
    expect(multiplicarCentavos("1.000", "0.1")).toBe(10);
    expect(multiplicarCentavos(3, "33.3333")).toBe(10000);
    expect(multiplicarCentavos("2.5", "19.99")).toBe(4998); // 49,975 → 49,98
  });
});
