import { describe, it, expect } from "vitest";
import { descontoAcimaDaPolitica } from "./politica-desconto";

describe("desconto acima da política (vai para o LogAuditoria)", () => {
  it("até 5% do bruto não audita", () => {
    expect(descontoAcimaDaPolitica({ valorBruto: 1000, descontoTotal: 50 })).toBe(false);
    expect(descontoAcimaDaPolitica({ valorBruto: 1000, descontoTotal: 0 })).toBe(false);
  });
  it("acima de 5% audita (só passa por gerente ou admin)", () => {
    expect(descontoAcimaDaPolitica({ valorBruto: 1000, descontoTotal: 50.01 })).toBe(true);
    expect(descontoAcimaDaPolitica({ valorBruto: 1000, descontoTotal: 150 })).toBe(true);
  });
  it("bruto zero não audita", () => {
    expect(descontoAcimaDaPolitica({ valorBruto: 0, descontoTotal: 10 })).toBe(false);
  });
});
