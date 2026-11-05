import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validarEnvs } from "./env";
import { filtrarAlertas, ALERTA_INTERVALO_MS, corpoWebhook } from "./alerta";
import { tokenConfere } from "./token";
import { avaliarHeartbeat } from "./saude";
import { montarRegistro, dsnSentry, limparTexto } from "../observabilidade";

vi.mock("@/lib/operacao/saude", async (orig) => ({
  ...(await orig<typeof import("./saude")>()),
  coletarSaude: vi.fn(async () => ({ ok: true, verificadoEm: "x", itens: [] })),
}));

describe("validarEnvs", () => {
  it("aponta fatais, obrigatórias e opcionais só por nome", () => {
    const r = validarEnvs({ SESSION_SECRET: "curto", WEBHOOK_TOKEN: "x", APP_URL: "https://a" });
    expect(r.fatais).toEqual(["DATABASE_URL"]);
    expect(r.obrigatorias).toEqual(["SESSION_SECRET"]); // menos de 32 caracteres
    expect(r.opcionais).toContain("SENTRY_DSN");
    expect(JSON.stringify(r)).not.toContain("curto");
  });
  it("tudo certo", () => {
    const r = validarEnvs({ DATABASE_URL: "postgres://x", SESSION_SECRET: "s".repeat(32), WEBHOOK_TOKEN: "w", APP_URL: "https://a" });
    expect(r.fatais).toEqual([]);
    expect(r.obrigatorias).toEqual([]);
  });
});

describe("registro de erro sem dado pessoal", () => {
  it("mascara CPF, CNPJ, e-mail e telefone", () => {
    const reg = montarRegistro(new Error("Falha para 123.456.789-09, 12345678000199, joao@loja.com.br e (11) 98765-4321"), {
      rota: "/api/x",
      empresaId: "emp1",
      requestId: "abc",
      extra: { cpf: "12345678909", obs: "fale com maria@x.com" },
    });
    const txt = JSON.stringify(reg);
    expect(txt).not.toMatch(/123\.456\.789-09|12345678000199|joao@|maria@|98765-4321|12345678909/);
    expect(reg.empresaId).toBe("emp1");
    expect(reg.requestId).toBe("abc");
    expect(reg.nivel).toBe("error");
  });
  it("limparTexto deixa texto comum", () => {
    expect(limparTexto("pedido 55 falhou")).toBe("pedido 55 falhou");
  });
  it("interpreta o DSN do Sentry", () => {
    expect(dsnSentry("https://chave123@o1.ingest.sentry.io/42")).toEqual({
      url: "https://o1.ingest.sentry.io/api/42/envelope/",
      chave: "chave123",
    });
    expect(dsnSentry("lixo")).toBeNull();
  });
});

describe("deduplicação do alerta", () => {
  const p = [{ nome: "banco", ok: false, detalhe: "caiu" }];
  it("não repete em menos de 1 h e repete depois", () => {
    const m = new Map<string, number>();
    expect(filtrarAlertas(p, m, 0)).toHaveLength(1);
    expect(filtrarAlertas(p, m, 30 * 60_000)).toHaveLength(0);
    expect(filtrarAlertas(p, m, ALERTA_INTERVALO_MS)).toHaveLength(1);
  });
  it("problema que sumiu e voltou avisa de novo; texto diferente avisa", () => {
    const m = new Map<string, number>();
    filtrarAlertas(p, m, 0);
    filtrarAlertas([], m, 60_000);
    expect(filtrarAlertas(p, m, 120_000)).toHaveLength(1);
    expect(filtrarAlertas([{ nome: "banco", ok: false, detalhe: "lento" }], m, 130_000)).toHaveLength(1);
  });
  it("corpo do webhook serve a Discord, Slack e ntfy", () => {
    const c = corpoWebhook("oi");
    expect([c.content, c.text, c.message]).toEqual(["oi", "oi", "oi"]);
  });
});

describe("token e heartbeat", () => {
  it("compara token", () => {
    expect(tokenConfere("segredo", "segredo")).toBe(true);
    expect(tokenConfere("errado", "segredo")).toBe(false);
    expect(tokenConfere("", "segredo")).toBe(false);
    expect(tokenConfere("x", undefined)).toBe(false);
  });
  it("heartbeat velho ou ausente é problema", () => {
    expect(avaliarHeartbeat(null).ok).toBe(false);
    expect(avaliarHeartbeat(Date.now() - 10 * 60_000).ok).toBe(false);
    expect(avaliarHeartbeat(Date.now() - 10_000).ok).toBe(true);
  });
});

describe("GET /api/health/detalhado", () => {
  const velho = process.env.HEALTH_TOKEN;
  beforeEach(() => { process.env.HEALTH_TOKEN = "tok-certo"; });
  afterEach(() => { process.env.HEALTH_TOKEN = velho; if (velho === undefined) delete process.env.HEALTH_TOKEN; });
  const chamar = async (headers: Record<string, string>) => {
    const { GET } = await import("@/app/api/health/detalhado/route");
    return GET(new Request("http://x/api/health/detalhado", { headers }) as never);
  };
  it("token certo -> 200", async () => {
    expect((await chamar({ authorization: "Bearer tok-certo" })).status).toBe(200);
    expect((await chamar({ "x-health-token": "tok-certo" })).status).toBe(200);
  });
  it("token errado ou ausente -> 401", async () => {
    expect((await chamar({ authorization: "Bearer errado" })).status).toBe(401);
    expect((await chamar({})).status).toBe(401);
  });
  it("sem HEALTH_TOKEN na env -> 404", async () => {
    delete process.env.HEALTH_TOKEN;
    expect((await chamar({ authorization: "Bearer tok-certo" })).status).toBe(404);
  });
});

describe("respostaErro 500", () => {
  it("devolve código para o suporte, header e não vaza detalhe", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { respostaErro } = await import("../auth/guard");
    const r = respostaErro(new Error("Invocation prisma: connect ECONNREFUSED 10.0.0.1"), { rota: "/api/x" });
    const corpo = await r.json();
    expect(r.status).toBe(500);
    expect(corpo.erro).toContain(`código ${corpo.requestId}`);
    expect(corpo.erro).not.toMatch(/prisma|ECONN/i);
    expect(r.headers.get("x-request-id")).toBe(corpo.requestId);
    spy.mockRestore();
  });
});
