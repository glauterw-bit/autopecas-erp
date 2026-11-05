import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../db", () => ({ prisma: {} }));

import { avaliarMargemItem } from "./margin-guard";
import { formatarCentavos, paraCentavos, totalItemCentavos } from "./dinheiro";

describe("dinheiro em centavos", () => {
  it("arredonda meia unidade para cima sem erro de float", () => {
    expect(paraCentavos("2.675")).toBe(268); // Math.round(2.675*100) daria 267
    expect(paraCentavos(1.005)).toBe(101);
    expect(paraCentavos(new Prisma.Decimal("89.9000"))).toBe(8990);
  });
  it("total do item: preço × quantidade arredondado uma vez", () => {
    expect(totalItemCentavos("19.99", "3")).toBe(5997);
    expect(totalItemCentavos("0.1", 3)).toBe(30); // 0.1*3 em float = 0.30000000000000004
    expect(totalItemCentavos(new Prisma.Decimal("12.3456"), "2.5")).toBe(3086); // 30,864 → 30,86
  });
  it("formata em reais", () => {
    expect(formatarCentavos(123456)).toBe("R$ 1.234,56");
    expect(formatarCentavos(5)).toBe("R$ 0,05");
  });
});

describe("MarginGuard (Decimal/centavos)", () => {
  it("margem abaixo da metade da meta bloqueia e sugere preço em centavos, arredondado para cima", () => {
    const a = avaliarMargemItem({
      custoUnitario: new Prisma.Decimal("10.0000"),
      precoUnitario: new Prisma.Decimal("11.0000"),
      margemAlvo: new Prisma.Decimal("0.3500"),
    });
    expect(a.okay).toBe(false);
    // 1000 / 0,65 = 1538,46… → 1539 centavos
    expect(a.precoSugeridoCentavos).toBe(1539);
    expect(a.precoSugerido).toBe(15.39);
    expect(a.margemAtual).toBe(0.0909);
    expect(a.motivos[0]).toContain("9,1%");
  });
  it("preço abaixo do mínimo é comparado em centavos e mostrado em reais", () => {
    const a = avaliarMargemItem({ custoUnitario: 5, precoUnitario: 11.99, precoMinimo: "12" });
    expect(a.okay).toBe(false);
    expect(a.motivos[0]).toBe("Preço abaixo do mínimo configurado (R$ 12,00).");
  });
  it("preço igual ao mínimo passa (sem diferença de float)", () => {
    const a = avaliarMargemItem({ custoUnitario: "0.1", precoUnitario: 0.3, precoMinimo: "0.30" , margemAlvo: 0.2 });
    expect(a.okay).toBe(true);
  });
  it("margem alvo inválida (>= 1) cai no padrão de 20% em vez de dividir por zero", () => {
    const a = avaliarMargemItem({ custoUnitario: 80, precoUnitario: 100, margemAlvo: 1 });
    expect(a.margemMinima).toBe(0.2);
    expect(a.precoSugeridoCentavos).toBe(10000);
  });
});
