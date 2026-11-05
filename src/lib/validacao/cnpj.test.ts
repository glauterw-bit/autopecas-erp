import { describe, expect, it } from "vitest";
import { cnpjValido, limparCnpj } from "./cnpj";

describe("cnpjValido", () => {
  it("aceita CNPJ válido, com ou sem pontuação", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("00.000.000/0001-91")).toBe(true); // Banco do Brasil
  });
  it("recusa dígito errado, tamanho errado e repetidos", () => {
    expect(cnpjValido("11222333000182")).toBe(false);
    expect(cnpjValido("1122233300018")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
    expect(cnpjValido("")).toBe(false);
  });
  it("aceita o formato alfanumérico (exemplo oficial da Receita: 12.ABC.345/01DE-35)", () => {
    expect(cnpjValido("12ABC34501DE35")).toBe(true);
    expect(cnpjValido("12ABC34501DE36")).toBe(false);
  });
  it("limpa a pontuação", () => {
    expect(limparCnpj("12.abc.345/01de-35")).toBe("12ABC34501DE35");
  });
});
