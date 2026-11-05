import { describe, expect, it } from "vitest";
import { calcularTotais } from "./importar-venda";

describe("totais da venda importada (centavos)", () => {
  it("soma itens + frete sem erro de float", () => {
    const r = calcularTotais(
      [
        { produtoId: "a", quantidade: 3, precoUnitario: 19.9, custoMedio: 11.3333 },
        { produtoId: "b", quantidade: 1, precoUnitario: 0.1, custoMedio: 0.05 },
      ],
      15.2,
    );
    expect(r.brutoC).toBe(5980); // 59,70 + 0,10
    expect(r.totalC).toBe(7500); // + 15,20 de frete
    expect(r.custoC).toBe(3405); // 34,00 + 0,05
    expect(r.linhas.map((l) => l.totalC)).toEqual([5970, 10]);
  });
  it("respeita o total informado pelo canal", () => {
    const r = calcularTotais([{ produtoId: "a", quantidade: 2, precoUnitario: 50, custoMedio: 30, total: 95 }], 0, 95);
    expect(r.totalC).toBe(9500);
    expect(r.linhas[0]!.totalC).toBe(9500);
    expect(r.brutoC).toBe(10000);
  });
});
