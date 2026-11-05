import { describe, expect, it } from "vitest";
import { cifrar, cifrarSeTexto, decifrar, decifrarOpcional, ErroCripto, estaCifrado, mascarar } from "./cripto";

const K1 = Buffer.alloc(32, 1).toString("base64");
const K2 = Buffer.alloc(32, 2).toString("hex");
const ENV = { APP_ENCRYPTION_KEY: K1 };

describe("cripto (AES-256-GCM)", () => {
  it("cifra e decifra, sem o texto aparecer no gravado e com IV novo a cada vez", () => {
    const a = cifrar("token-secreto-123", ENV);
    const b = cifrar("token-secreto-123", ENV);
    expect(estaCifrado(a)).toBe(true);
    expect(a).not.toContain("token-secreto");
    expect(a).not.toBe(b);
    expect(decifrar(a, ENV)).toBe("token-secreto-123");
    expect(decifrar(b, ENV)).toBe("token-secreto-123");
    expect(decifrar(cifrar("ção ü 😀", ENV), ENV)).toBe("ção ü 😀");
  });

  it("chave errada: erro claro, nunca lixo", () => {
    const a = cifrar("x", ENV);
    expect(() => decifrar(a, { APP_ENCRYPTION_KEY: K2 })).toThrow(ErroCripto);
    expect(() => decifrar(a, { APP_ENCRYPTION_KEY: K2 })).toThrow(/chave de cifra/);
  });

  it("dado adulterado é recusado", () => {
    const a = cifrar("abcdef", ENV);
    const partes = a.split(":");
    const ct = Buffer.from(partes[4], "base64url");
    ct[0] ^= 1;
    partes[4] = ct.toString("base64url");
    expect(() => decifrar(partes.join(":"), ENV)).toThrow(ErroCripto);
  });

  it("troca de chave: lê com a anterior", () => {
    const velho = cifrar("v", ENV);
    expect(decifrar(velho, { APP_ENCRYPTION_KEY: K2, APP_ENCRYPTION_KEY_ANTERIOR: K1 })).toBe("v");
  });

  it("legado em texto aberto é lido como está (migração gradual)", () => {
    expect(decifrar("APP_USR-legado", ENV)).toBe("APP_USR-legado");
    expect(decifrar("APP_USR-legado", {})).toBe("APP_USR-legado");
    expect(decifrarOpcional(null, ENV)).toBeNull();
    expect(decifrarOpcional("", ENV)).toBeNull();
  });

  it("sem chave não grava (nunca cai para texto aberto)", () => {
    expect(() => cifrar("x", {})).toThrow(/APP_ENCRYPTION_KEY/);
    expect(() => decifrar(cifrar("x", ENV), {})).toThrow(/APP_ENCRYPTION_KEY/);
  });

  it("chave de tamanho errado é recusada", () => {
    expect(() => cifrar("x", { APP_ENCRYPTION_KEY: "curta" })).toThrow(/32 bytes/);
  });

  it("cifrarSeTexto não cifra duas vezes e deixa vazio/nulo", () => {
    const a = cifrarSeTexto("t", ENV);
    expect(cifrarSeTexto(a, ENV)).toBe(a);
    expect(cifrarSeTexto(null, ENV)).toBeNull();
    expect(cifrarSeTexto("", ENV)).toBe("");
  });
});

describe("mascarar", () => {
  it("mostra só o final; curto não mostra nada", () => {
    expect(mascarar("abcdefghijklmnopqrstuvwxyz123456")).toBe("••••3456");
    expect(mascarar("abcdefgh")).toBe("••••gh");
    expect(mascarar("1234567")).toBe("••••");
    expect(mascarar("")).toBe("");
    expect(mascarar(null)).toBe("");
  });
});
