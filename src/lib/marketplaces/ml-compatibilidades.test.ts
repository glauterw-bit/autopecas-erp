import { describe, expect, it } from "vitest";
import {
  anosDaVersao,
  corpoBuscaVeiculos,
  escolherValor,
  filtrarPorMotor,
  lotes,
  planejarCompatibilidades,
} from "./ml-compatibilidades";

describe("mapeamento AplicacaoVeicular → compatibilidade ML", () => {
  const marcas = [
    { id: "60249", name: "Mercedes-Benz" },
    { id: "9909", name: "Renault" },
    { id: "67781", name: "Fiat" },
  ];
  it("casa nome ignorando acento, caixa e pontuação", () => {
    expect(escolherValor("MERCEDES BENZ", marcas)?.id).toBe("60249");
    expect(escolherValor("renault", marcas)?.id).toBe("9909");
  });
  it("não chuta: nome parecido ou ambíguo devolve null", () => {
    expect(escolherValor("Mercedes", marcas)).toBeNull();
    expect(escolherValor("Ducato", [{ id: "1", name: "Ducato" }, { id: "2", name: "DUCATO" }])).toBeNull();
  });
  it("anos da versão, com herança do modelo e ano aberto", () => {
    expect(anosDaVersao({ anoInicio: 2012, anoFim: 2014 }, {})).toEqual([2012, 2013, 2014]);
    expect(anosDaVersao({ anoInicio: null, anoFim: null }, { anoInicio: 2024 }, 2026)).toEqual([2024, 2025, 2026, 2027]);
    expect(anosDaVersao({}, {})).toEqual([]);
  });
  it("monta a busca no domínio de carros e vans", () => {
    expect(corpoBuscaVeiculos("MLB-CARS_AND_VANS_FOR_COMPATIBILITIES", "60249", "M1", ["Y1", "Y2"])).toEqual({
      domain_id: "MLB-CARS_AND_VANS_FOR_COMPATIBILITIES",
      site_id: "MLB",
      known_attributes: [
        { id: "BRAND", value_ids: ["60249"] },
        { id: "MODEL", value_ids: ["M1"] },
        { id: "VEHICLE_YEAR", value_ids: ["Y1", "Y2"] },
      ],
    });
  });
  it("filtra pelo motor da versão (Sprinter 2.2 x 2.1) e não inventa quando não bate", () => {
    const veiculos = [
      { id: "A", name: "Mercedes-Benz Sprinter 2.2 415 CDI 2020" },
      { id: "B", name: "Mercedes-Benz Sprinter 2.1 415 CDI 2014" },
    ];
    expect(filtrarPorMotor(veiculos, "OM651 2.2 Diesel").map((v) => v.id)).toEqual(["A"]);
    expect(filtrarPorMotor(veiculos, "3.0 V6")).toEqual([]);
    expect(filtrarPorMotor(veiculos, null)).toHaveLength(2);
  });
  it("plano só adiciona o que falta e nunca mexe nas do catálogo (só leitura desde 15/07/2026)", () => {
    const plano = planejarCompatibilidades(
      ["V1", "V2", "V3", "V3"],
      [
        { catalog_product_id: "V1", source: "SELLER" },
        { catalog_product_id: null, source: "CATALOGO" },
      ],
    );
    expect(plano).toEqual({ adicionar: ["V2", "V3"], jaExistentes: 2, doCatalogo: 1 });
  });
  it("divide em lotes", () => {
    expect(lotes(Array.from({ length: 450 }, (_, i) => i)).map((l) => l.length)).toEqual([200, 200, 50]);
  });
});
