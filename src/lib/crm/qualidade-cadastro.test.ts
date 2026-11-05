import { describe, it, expect } from "vitest";
import {
  avaliarCadastro,
  duplicadosPorCodigo,
  eanValido,
  ncmValido,
  normalizarCodigo,
  problemasDoProduto,
  validarSelo,
  type ProdutoQualidade,
} from "./qualidade-cadastro";

const base: ProdutoQualidade = {
  id: "p1",
  marcaId: "bosch",
  ncm: "8708.30.90",
  codigoBarras: "7891234567895",
  codigoFabricante: "0 986 BB0 123",
  qtdAplicacoes: 2,
  revisaoCadastro: false,
  aplicacaoVerificadaEm: new Date("2026-11-01"),
};

describe("qualidade de cadastro", () => {
  it("NCM: 8 dígitos e não zerado", () => {
    expect(ncmValido("87083090")).toBe(true);
    expect(ncmValido("8708.30.90")).toBe(true);
    expect(ncmValido("00000000")).toBe(false);
    expect(ncmValido("870830")).toBe(false);
    expect(ncmValido(null)).toBe(false);
  });

  it("EAN: dígito verificador GS1", () => {
    expect(eanValido("7891234567895")).toBe(true);
    expect(eanValido("7891234567890")).toBe(false);
    expect(eanValido("4006381333931")).toBe(true);
    expect(eanValido("96385074")).toBe(true); // GTIN-8
    expect(eanValido("0000000000000")).toBe(false);
    expect(eanValido("ABC")).toBe(false);
  });

  it("produto completo e verificado não tem problema", () => {
    expect(problemasDoProduto(base)).toEqual([]);
  });

  it("lista cada problema", () => {
    const p = { ...base, ncm: null, codigoBarras: "123", codigoFabricante: " ", qtdAplicacoes: 0, revisaoCadastro: true };
    expect(problemasDoProduto(p, true)).toEqual([
      "SEM_NCM",
      "EAN_INVALIDO",
      "SEM_APLICACAO",
      "SEM_CODIGO_FABRICANTE",
      "REVISAO",
      "DUPLICADO",
    ]);
    expect(problemasDoProduto({ ...base, codigoBarras: null, aplicacaoVerificadaEm: null })).toEqual([
      "SEM_EAN",
      "NAO_VERIFICADO",
    ]);
  });

  it("normaliza código para comparar", () => {
    expect(normalizarCodigo(" 0 986-bb0.123 ")).toBe("0986BB0123");
  });

  it("duplicado: mesmo EAN ou mesmo código do fabricante na mesma marca; OEM igual não é duplicado", () => {
    const lista: ProdutoQualidade[] = [
      base,
      { ...base, id: "p2", codigoBarras: "789-1234567895", codigoFabricante: "X1" }, // mesmo EAN
      { ...base, id: "p3", codigoBarras: null, codigoFabricante: "0986BB0123" }, // mesmo cód. fab, mesma marca
      { ...base, id: "p4", marcaId: "cofap", codigoBarras: null, codigoFabricante: "0986BB0123" }, // outra marca
    ];
    const d = duplicadosPorCodigo(lista);
    expect(d.get("p1")?.map((x) => x.campo).sort()).toEqual(["CODIGO_FABRICANTE", "EAN"]);
    expect(d.get("p2")?.[0]).toEqual({ campo: "EAN", codigo: "7891234567895", outrosIds: ["p1"] });
    expect(d.get("p3")?.[0].outrosIds).toEqual(["p1"]);
    expect(d.has("p4")).toBe(false);
  });

  it("resumo: % verificado e contagem por problema", () => {
    const { resumo } = avaliarCadastro([
      base,
      { ...base, id: "p2", codigoBarras: null, codigoFabricante: "Z9", aplicacaoVerificadaEm: null },
      { ...base, id: "p3", codigoBarras: null, codigoFabricante: "Z8", ncm: null, qtdAplicacoes: 0, aplicacaoVerificadaEm: null },
      { ...base, id: "p4", codigoBarras: null, codigoFabricante: "Z7", revisaoCadastro: true },
    ]);
    expect(resumo.total).toBe(4);
    expect(resumo.verificados).toBe(2);
    expect(resumo.pctVerificado).toBe(50);
    expect(resumo.pctCompleto).toBe(25);
    expect(resumo.porProblema.SEM_EAN).toBe(3);
    expect(resumo.porProblema.SEM_NCM).toBe(1);
    expect(resumo.porProblema.REVISAO).toBe(1);
  });

  it("selo exige aplicação cadastrada", () => {
    expect(validarSelo(0)).toMatch(/aplicação/);
    expect(validarSelo(1)).toBeNull();
  });
});
