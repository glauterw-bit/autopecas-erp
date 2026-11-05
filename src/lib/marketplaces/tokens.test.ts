import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lerTokenConta, tokensParaGravar } from "./tokens";

const CHAVE = Buffer.alloc(32, 7).toString("base64");

beforeEach(() => {
  process.env.APP_ENCRYPTION_KEY = CHAVE;
});
afterEach(() => {
  delete process.env.APP_ENCRYPTION_KEY;
});

describe("tokens de marketplace em repouso", () => {
  it("grava cifrado e lê de volta", () => {
    const g = tokensParaGravar({ accessToken: "APP_USR-123", refreshToken: "TG-456", outro: 1 });
    expect(g.accessToken).toMatch(/^enc:v1:/);
    expect(g.refreshToken).toMatch(/^enc:v1:/);
    expect(g.outro).toBe(1);
    expect(lerTokenConta(g.accessToken)).toBe("APP_USR-123");
    expect(lerTokenConta(g.refreshToken)).toBe("TG-456");
  });
  it("não cifra duas vezes nem cria campo ausente", () => {
    const g = tokensParaGravar({ accessToken: "a" });
    expect(tokensParaGravar(g).accessToken).toBe(g.accessToken);
    expect("refreshToken" in g).toBe(false);
    expect(tokensParaGravar({ accessToken: null }).accessToken).toBeNull();
  });
  it("legado em texto aberto continua funcionando", () => {
    expect(lerTokenConta("APP_USR-legado")).toBe("APP_USR-legado");
    expect(lerTokenConta(null)).toBeNull();
  });
  it("chave trocada: pede para reconectar, sem devolver lixo", () => {
    const g = tokensParaGravar({ accessToken: "x" });
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
    expect(() => lerTokenConta(g.accessToken)).toThrow(/reconecte a conta/);
  });
});
