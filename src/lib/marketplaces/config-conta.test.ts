import { describe, expect, it } from "vitest";
import { importarDesdeDaConta, mesclarConfiguracoes } from "./config-conta";

const criadoEm = new Date("2026-10-01T12:00:00Z");

describe("importar pedidos desde", () => {
  it("usa a data configurada", () => {
    const d = importarDesdeDaConta({ configuracoes: { importarPedidosDesde: "2026-11-03T00:00:00.000Z" }, criadoEm });
    expect(d.toISOString()).toBe("2026-11-03T00:00:00.000Z");
  });
  it("sem configuração (ou inválida) cai na data de criação da conta", () => {
    expect(importarDesdeDaConta({ configuracoes: null, criadoEm })).toEqual(criadoEm);
    expect(importarDesdeDaConta({ configuracoes: { importarPedidosDesde: "lixo" }, criadoEm })).toEqual(criadoEm);
  });
  it("mesclar preserva as outras opções", () => {
    expect(mesclarConfiguracoes({ taxa: 0.1 }, { importarPedidosDesde: "x" })).toEqual({ taxa: 0.1, importarPedidosDesde: "x" });
  });
});
