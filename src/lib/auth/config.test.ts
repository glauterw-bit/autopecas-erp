import { describe, it, expect } from "vitest";
import { hashSenha, verificarSenha } from "./config";

describe("hash de senha PBKDF2", () => {
  it("aceita a senha correta e rejeita a errada", () => {
    const h = hashSenha("S3nh@Forte!");
    expect(h.startsWith("pbkdf2$")).toBe(true);
    expect(verificarSenha("S3nh@Forte!", h)).toBe(true);
    expect(verificarSenha("outra", h)).toBe(false);
  });
  it("gera salts diferentes a cada hash", () => {
    expect(hashSenha("abc")).not.toBe(hashSenha("abc"));
  });
  it("rejeita formatos desconhecidos sem lançar", () => {
    expect(verificarSenha("abc", "texto-plano")).toBe(false);
  });
});
