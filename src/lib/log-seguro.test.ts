import { describe, expect, it, vi } from "vitest";
import { erroSeguro, mascararTexto } from "./log-seguro";
import { respostaErro } from "./auth/guard";

describe("máscara dos logs", () => {
  it("esconde CPF e CNPJ completos, com ou sem pontuação", () => {
    const t = mascararTexto("cliente 529.982.247-25 e 52998224725, loja 11.222.333/0001-81 e 11222333000181");
    expect(t).not.toMatch(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
    expect(t).not.toContain("11222333");
    expect(t).toBe("cliente *** e ***, loja *** e ***");
  });

  it("esconde token, senha e cabeçalho de autorização", () => {
    const t = mascararTexto('Authorization: Bearer abc123def456ghi789 senha=Segredo123 {"token":"xyz987654"} vlt_abcdef123456');
    expect(t).not.toContain("abc123def456ghi789");
    expect(t).not.toContain("Segredo123");
    expect(t).not.toContain("xyz987654");
    expect(t).not.toContain("vlt_abcdef");
  });

  it("deixa texto comum como está", () => {
    expect(mascararTexto("falha ao enviar pedido 4521 da conta 7")).toBe("falha ao enviar pedido 4521 da conta 7");
  });

  it("erroSeguro devolve só nome e mensagem mascarados, limitados", () => {
    const s = erroSeguro(new Error("duplicado para 529.982.247-25"));
    expect(s).toBe("Error: duplicado para ***");
    expect(erroSeguro(new Error("x".repeat(1000))).length).toBe(300);
  });

  it("o guard das rotas não imprime documento do erro", () => {
    const espiao = vi.spyOn(console, "error").mockImplementation(() => undefined);
    respostaErro(new Error("Invalid prisma invocation: cpfCnpj 529.982.247-25"));
    const impresso = espiao.mock.calls.flat().join(" ");
    espiao.mockRestore();
    expect(impresso).not.toContain("529.982.247-25");
    expect(impresso).toContain("***");
  });
});
