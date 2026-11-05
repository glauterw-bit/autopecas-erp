import { describe, expect, it } from "vitest";
import {
  analisarTermo,
  escaparLike,
  normalizarCodigo,
  normalizarTexto,
  ordenarPorRelevancia,
  Relevancia,
  relevanciaCodigo,
  type Candidato,
} from "./busca-normalizar";

describe("normalizarCodigo", () => {
  it("tira traço, ponto, barra e espaço e põe em maiúsculo", () => {
    expect(normalizarCodigo("45022-sna-a00")).toBe("45022SNAA00");
    expect(normalizarCodigo("290.730.370")).toBe("290730370");
    expect(normalizarCodigo("PD/1083")).toBe("PD1083");
    expect(normalizarCodigo(" 0 986 4B0 123 ")).toBe("09864B0123");
  });
  it("com e sem traço dão o mesmo código", () => {
    expect(normalizarCodigo("TE-84781")).toBe(normalizarCodigo("te84781"));
  });
  it("tira acento como o unaccent do banco", () => {
    expect(normalizarCodigo("Ç-ão")).toBe("CAO");
  });
  it("EAN fica igual", () => {
    expect(normalizarCodigo("7891893670473")).toBe("7891893670473");
  });
  it("só símbolos vira vazio", () => {
    expect(normalizarCodigo("-./")).toBe("");
  });
});

describe("normalizarTexto e analisarTermo", () => {
  it("minúsculo, sem acento e espaço simples", () => {
    expect(normalizarTexto("  Óleo   Motor 15W40 ")).toBe("oleo motor 15w40");
  });
  it("separa palavras e anos", () => {
    const t = analisarTermo("Past Diant Sprinter 2015");
    expect(t.palavras).toEqual(["past", "diant", "sprinter"]);
    expect(t.anos).toEqual([2015]);
    expect(t.codigo).toBe("PASTDIANTSPRINTER2015");
    expect(t.bruto).toBe("Past Diant Sprinter 2015");
  });
  it("número que não é ano continua palavra", () => {
    expect(analisarTermo("bateria 60ah 1200").anos).toEqual([]);
    expect(analisarTermo("bateria 60ah 1200").palavras).toEqual(["bateria", "60ah", "1200"]);
  });
  it("escapa curingas do LIKE", () => {
    expect(escaparLike("50%_a\\b")).toBe("50\\%\\_a\\\\b");
  });
});

describe("relevanciaCodigo: exato > começa com > contém", () => {
  const p = { sku: "PF-002", codigoBarras: null, codigoFabricante: "BP-1100", codigoOem: "45022-SNA-A00" };
  it("exato em qualquer código, com ou sem traço", () => {
    expect(relevanciaCodigo(p, normalizarCodigo("bp 1100"))).toBe(Relevancia.CODIGO_EXATO);
    expect(relevanciaCodigo(p, normalizarCodigo("45022SNAA00"))).toBe(Relevancia.CODIGO_EXATO);
  });
  it("começa com", () => {
    expect(relevanciaCodigo(p, normalizarCodigo("45022-sna"))).toBe(Relevancia.CODIGO_COMECA);
  });
  it("contém", () => {
    expect(relevanciaCodigo(p, normalizarCodigo("SNA-A0"))).toBe(Relevancia.CODIGO_CONTEM);
  });
  it("não casa", () => {
    expect(relevanciaCodigo(p, "XYZ")).toBeNull();
    expect(relevanciaCodigo(p, "")).toBeNull();
  });
});

describe("ordenarPorRelevancia", () => {
  const c = (id: string, relevancia: Relevancia, similaridade = 0): Candidato => ({
    id,
    nome: id,
    relevancia,
    similaridade,
  });

  it("exato > começa com > contém > texto, e texto por similaridade", () => {
    const r = ordenarPorRelevancia([
      c("texto-baixo", Relevancia.TEXTO, 0.2),
      c("contem", Relevancia.CODIGO_CONTEM),
      c("texto-alto", Relevancia.TEXTO, 0.7),
      c("exato", Relevancia.CODIGO_EXATO),
      c("comeca", Relevancia.CODIGO_COMECA),
    ]);
    expect(r.map((x) => x.id)).toEqual(["exato", "comeca", "contem", "texto-alto", "texto-baixo"]);
  });

  it("produto repetido fica uma vez, com a maior relevância", () => {
    const r = ordenarPorRelevancia([
      c("a", Relevancia.TEXTO, 0.9),
      c("b", Relevancia.CODIGO_CONTEM),
      c("a", Relevancia.CODIGO_COMECA),
    ]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ id: "a", relevancia: Relevancia.CODIGO_COMECA });
  });

  it("no empate mantém a ordem que veio do banco (paginação estável)", () => {
    const r = ordenarPorRelevancia([c("z", Relevancia.TEXTO, 0.5), c("a", Relevancia.TEXTO, 0.5)]);
    expect(r.map((x) => x.id)).toEqual(["z", "a"]);
  });
});
