import { describe, expect, it } from "vitest";
import { montarTarefas } from "./onboarding";

const vazia = { inscEstadual: null, logradouro: null, cep: null, municipio: null, uf: null, configuracoes: null };

describe("tarefas do onboarding", () => {
  it("loja recém-criada tem tudo por fazer", () => {
    const t = montarTarefas(vazia, { produtos: 0, usuarios: 1 });
    expect(t.map((x) => x.feita)).toEqual([false, false, false, false, false]);
  });
  it("marca o que já foi feito", () => {
    const t = montarTarefas(
      { inscEstadual: "123", logradouro: "Rua A", cep: "06750000", municipio: "Taboão da Serra", uf: "SP",
        configuracoes: { onboarding: { regimeConfirmadoEm: "2026-11-05" }, fiscal: { focus: { ambiente: "homologacao" } } } },
      { produtos: 10, usuarios: 3 },
    );
    expect(t.every((x) => x.feita)).toBe(true);
  });
});
