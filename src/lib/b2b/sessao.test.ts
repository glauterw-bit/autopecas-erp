import { describe, it, expect } from "vitest";
import { selarSessaoB2B, abrirSessaoB2B } from "./sessao";

describe("cookie assinado da sessão B2B", () => {
  it("assina e reabre o mesmo id", () => {
    const selo = selarSessaoB2B("cliente-123");
    expect(abrirSessaoB2B(selo)).toBe("cliente-123");
  });
  it("rejeita assinatura adulterada (troca de id)", () => {
    const selo = selarSessaoB2B("cliente-123");
    const [, exp, sig] = selo.split(".");
    expect(abrirSessaoB2B(`cliente-OUTRO.${exp}.${sig}`)).toBeNull();
  });
  it("rejeita valor sem assinatura (cookie antigo/forjado)", () => {
    expect(abrirSessaoB2B("cliente-123")).toBeNull();
    expect(abrirSessaoB2B(undefined)).toBeNull();
  });
  it("rejeita sessão expirada", () => {
    const passado = Math.floor(Date.now() / 1000) - 10;
    const crypto = require("node:crypto");
    const payload = `cliente-123.${passado}`;
    const sig = crypto
      .createHmac("sha256", "dev-secret-nao-usar-em-producao-0000")
      .update(payload)
      .digest("base64url");
    expect(abrirSessaoB2B(`${payload}.${sig}`)).toBeNull();
  });
});
