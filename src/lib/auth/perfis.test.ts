import { describe, it, expect } from "vitest";
import { perfilMinimoDaRota, podeAbrirRota, podePerfil } from "./perfis";

describe("acesso às telas por perfil", () => {
  it("financeiro, contábil e fiscal exigem FINANCEIRO ou acima", () => {
    for (const rota of ["/financeiro", "/contabil", "/fiscal"]) {
      expect(perfilMinimoDaRota(rota)).toBe("FINANCEIRO");
      expect(podeAbrirRota("CAIXA", rota)).toBe(false);
      expect(podeAbrirRota("VENDEDOR", rota)).toBe(false);
      expect(podeAbrirRota("ESTOQUISTA", rota)).toBe(false);
      expect(podeAbrirRota("FINANCEIRO", rota)).toBe(true);
      expect(podeAbrirRota("GERENTE", rota)).toBe(true);
      expect(podeAbrirRota("ADMIN", rota)).toBe(true);
    }
  });
  it("configurações e implantação só para ADMIN", () => {
    expect(podeAbrirRota("GERENTE", "/configuracoes")).toBe(false);
    expect(podeAbrirRota("GERENTE", "/configuracoes/usuarios")).toBe(false);
    expect(podeAbrirRota("ADMIN", "/configuracoes/implantacao")).toBe(true);
  });
  it("usa a regra mais específica e ignora query e barra final", () => {
    expect(perfilMinimoDaRota("/compras/")).toBe("ESTOQUISTA");
    expect(perfilMinimoDaRota("/compras/sugestao?x=1")).toBe("GERENTE");
    expect(perfilMinimoDaRota("/relatorios/estoque-parado")).toBe("GERENTE");
  });
  it("rota fora do mapa nega para quem não é ADMIN", () => {
    expect(perfilMinimoDaRota("/rota-nova")).toBe("ADMIN");
    expect(podeAbrirRota("GERENTE", "/rota-nova")).toBe(false);
    expect(perfilMinimoDaRota("/financeirozinho")).toBe("ADMIN");
  });
  it("balcão continua abrindo PDV e caixa; técnico não abre PDV", () => {
    expect(podeAbrirRota("CAIXA", "/pdv")).toBe(true);
    expect(podeAbrirRota("CAIXA", "/caixa")).toBe(true);
    expect(podeAbrirRota("TECNICO", "/pdv")).toBe(false);
    expect(podeAbrirRota("TECNICO", "/os")).toBe(true);
  });
  it("perfil desconhecido não passa", () => {
    expect(podePerfil("XYZ", "ESTOQUISTA")).toBe(false);
  });
});
