import { describe, expect, it } from "vitest";
import { cifrar } from "../cripto";
import { configFocus, configFocusDaNota } from "./config-focus";

// Prioridade: token que a loja salvou (cifrado) > FOCUS_NFE_TOKEN_<CNPJ> > FOCUS_NFE_TOKEN.
const K = Buffer.alloc(32, 3).toString("base64");
const CNPJ = "11111111000111";
const empresa = (focus: Record<string, unknown>) => ({ cnpj: CNPJ, configuracoes: { fiscal: { focus } } });

describe("configFocus: configuração da empresa antes do env", () => {
  const env = { APP_ENCRYPTION_KEY: K, [`FOCUS_NFE_TOKEN_${CNPJ}`]: "env-cnpj", FOCUS_NFE_TOKEN: "env-global" };

  it("token da empresa (decifrado) ganha do env", () => {
    const c = configFocus(empresa({ tokenHomologacao: cifrar("tok-loja-h", { APP_ENCRYPTION_KEY: K }) }), env);
    expect(c.token).toBe("tok-loja-h");
    expect(c.origemToken).toBe("empresa");
  });

  it("legado em texto aberto também vale", () => {
    expect(configFocus(empresa({ tokenHomologacao: "tok-texto" }), env).token).toBe("tok-texto");
  });

  it("sem token da empresa, o env continua como reserva", () => {
    const c = configFocus(empresa({}), env);
    expect(c.token).toBe("env-cnpj");
    expect(c.origemToken).toBe("env");
    expect(configFocus(empresa({}), { FOCUS_NFE_TOKEN: "env-global" }).token).toBe("env-global");
    expect(configFocus(empresa({}), {}).origemToken).toBe("nenhuma");
  });

  it("usa o token do ambiente efetivo: produção só com empresa E servidor em produção", () => {
    const f = {
      ambiente: "producao",
      tokenHomologacao: cifrar("tok-h", { APP_ENCRYPTION_KEY: K }),
      tokenProducao: cifrar("tok-p", { APP_ENCRYPTION_KEY: K }),
    };
    expect(configFocus(empresa(f), { APP_ENCRYPTION_KEY: K }).token).toBe("tok-h");
    const prod = configFocus(empresa(f), { APP_ENCRYPTION_KEY: K, FOCUS_NFE_AMBIENTE: "producao" });
    expect(prod.ambiente).toBe("producao");
    expect(prod.token).toBe("tok-p");
  });

  it("token salvo ilegível (chave trocada): não cai no token do env, avisa", () => {
    const outro = Buffer.alloc(32, 9).toString("base64");
    const c = configFocus(empresa({ tokenHomologacao: cifrar("x", { APP_ENCRYPTION_KEY: outro }) }), env);
    expect(c.token).toBe("");
    expect(c.erroToken).toMatch(/APP_ENCRYPTION_KEY/);
  });

  it("configFocusDaNota: token salvo para o ambiente da nota tem prioridade", () => {
    const f = { tokenProducao: cifrar("tok-p", { APP_ENCRYPTION_KEY: K }) };
    const c = configFocusDaNota(empresa(f), "PRODUCAO", { ...env, FOCUS_NFE_TOKEN_PRODUCAO: "env-p" });
    expect(c.ambiente).toBe("producao");
    expect(c.token).toBe("tok-p");
    expect(configFocusDaNota(empresa({}), "PRODUCAO", { ...env, FOCUS_NFE_TOKEN_PRODUCAO: "env-p" }).token).toBe("env-p");
  });
});
