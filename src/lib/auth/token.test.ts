import { describe, it, expect } from "vitest";
import {
  deixariaSemAdmin,
  gerarToken,
  hashToken,
  validadeMs,
  validarSenhaNova,
} from "./token";
import { verificarSenha } from "./config";

describe("token de uso único", () => {
  it("gera tokens diferentes e o hash não é o token", () => {
    const a = gerarToken();
    expect(a).not.toBe(gerarToken());
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashToken(a)).not.toContain(a);
    expect(hashToken(a)).toBe(hashToken(a));
  });
  it("redefinição expira em 30 minutos", () => {
    expect(validadeMs("REDEFINICAO_SENHA")).toBe(30 * 60 * 1000);
  });
  it("senha pendente nunca confere", () => {
    expect(verificarSenha("", "!pendente")).toBe(false);
    expect(verificarSenha("!pendente", "!pendente")).toBe(false);
  });
});

describe("senha nova", () => {
  it("exige 10 caracteres com letra e número", () => {
    expect(validarSenhaNova("curta1")).not.toBeNull();
    expect(validarSenhaNova("somenteletras")).not.toBeNull();
    expect(validarSenhaNova("1234567890")).not.toBeNull();
    expect(validarSenhaNova("peca2026boa")).toBeNull();
  });
});

describe("último ADMIN", () => {
  it("bloqueia tirar o único ADMIN ativo", () => {
    expect(
      deixariaSemAdmin({ adminsAtivosOutros: 0, alvoEraAdminAtivo: true, alvoContinuaAdminAtivo: false }),
    ).toBe(true);
  });
  it("permite quando sobra outro ADMIN ativo", () => {
    expect(
      deixariaSemAdmin({ adminsAtivosOutros: 1, alvoEraAdminAtivo: true, alvoContinuaAdminAtivo: false }),
    ).toBe(false);
  });
  it("não interfere em quem não é ADMIN ou continua ADMIN", () => {
    expect(
      deixariaSemAdmin({ adminsAtivosOutros: 0, alvoEraAdminAtivo: false, alvoContinuaAdminAtivo: false }),
    ).toBe(false);
    expect(
      deixariaSemAdmin({ adminsAtivosOutros: 0, alvoEraAdminAtivo: true, alvoContinuaAdminAtivo: true }),
    ).toBe(false);
  });
});
