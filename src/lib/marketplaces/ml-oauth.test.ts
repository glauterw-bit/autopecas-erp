import { describe, expect, it } from "vitest";
import { assinarState, urlAutorizacaoML, verificarState } from "./ml-oauth";

const env = {
  ML_STATE_SECRET: "segredo-de-teste-com-mais-de-16",
  ML_APP_ID: "123",
  ML_REDIRECT_URI: "https://erp.exemplo.com.br/api/marketplaces/ml/callback",
} as unknown as NodeJS.ProcessEnv;

describe("state do OAuth do ML: segredo obrigatório", () => {
  it("sem ML_STATE_SECRET (mesmo com NEXTAUTH_SECRET) responde 503 e não assina nem verifica", () => {
    const sem = { NEXTAUTH_SECRET: "um-segredo-de-sessao-bem-longo" } as unknown as NodeJS.ProcessEnv;
    expect(() => assinarState({ empresaId: "e", usuarioId: "u" }, sem)).toThrowError(
      expect.objectContaining({ status: 503, message: expect.stringContaining("não configurada") }),
    );
    expect(() => verificarState("a.b", Date.now(), sem)).toThrowError(expect.objectContaining({ status: 503 }));
    const curto = { ML_STATE_SECRET: "curto" } as unknown as NodeJS.ProcessEnv;
    expect(() => assinarState({ empresaId: "e", usuarioId: "u" }, curto)).toThrowError(expect.objectContaining({ status: 503 }));
  });
});

describe("state do OAuth do ML", () => {
  it("ida e volta guarda empresa, usuário e nonce", () => {
    const { state, nonce } = assinarState({ empresaId: "emp1", usuarioId: "u1", agora: 1_000 }, env);
    expect(verificarState(state, 2_000, env)).toEqual({ empresaId: "emp1", usuarioId: "u1", nonce, expiraEm: 1_000 + 600_000 });
  });
  it("rejeita state adulterado (troca de empresa)", () => {
    const { state } = assinarState({ empresaId: "emp1", usuarioId: "u1" }, env);
    const [corpo, assin] = state.split(".");
    const forjado = Buffer.from(JSON.stringify({ e: "emp2", u: "u1", n: "x", x: Date.now() + 1e6 })).toString("base64url");
    expect(verificarState(`${forjado}.${assin}`, Date.now(), env)).toBeNull();
    expect(verificarState(`${corpo}.AAAA`, Date.now(), env)).toBeNull();
  });
  it("rejeita state expirado, vazio e assinado com outro segredo", () => {
    const { state } = assinarState({ empresaId: "emp1", usuarioId: "u1", agora: 0 }, env);
    expect(verificarState(state, 600_001, env)).toBeNull();
    expect(verificarState(null, 0, env)).toBeNull();
    const outro = { ...env, ML_STATE_SECRET: "outro-segredo-bem-diferente" } as NodeJS.ProcessEnv;
    expect(verificarState(state, 1, outro)).toBeNull();
  });
  it("monta a URL de autorização do Brasil", () => {
    const u = new URL(urlAutorizacaoML("abc", env));
    expect(u.origin + u.pathname).toBe("https://auth.mercadolivre.com.br/authorization");
    expect(u.searchParams.get("client_id")).toBe("123");
    expect(u.searchParams.get("state")).toBe("abc");
    expect(u.searchParams.get("response_type")).toBe("code");
  });
});
