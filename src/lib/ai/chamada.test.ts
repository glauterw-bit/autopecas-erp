import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Prisma } from "@prisma/client";
import { z } from "zod";

// Nada aqui chama a OpenAI: o cliente e o banco são falsos.
const m = vi.hoisted(() => ({
  create: vi.fn(),
  usoCreate: vi.fn(),
  aggregate: vi.fn(),
  empresa: vi.fn(),
}));

vi.mock("../db", () => ({
  prisma: {
    usoIA: { create: m.usoCreate, aggregate: m.aggregate },
    empresa: { findUnique: m.empresa },
  },
}));
vi.mock("./client", async (orig) => ({
  ...(await orig<typeof import("./client")>()),
  openai: { chat: { completions: { create: m.create } } },
}));

import { chamarEstruturado } from "./chamada";
import { ErroIA } from "./uso";

const schema = z.object({ nome: z.string(), confianca: z.number(), marca: z.string().nullable() });

function resposta(msg: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    model: "gpt-6.1-terra",
    choices: [{ finish_reason: "stop", message: { role: "assistant", content: null, refusal: null, ...msg } }],
    usage: { prompt_tokens: 1000, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 200 } },
    ...extra,
  };
}

const base = {
  empresaId: "emp-A",
  recurso: "vision",
  papel: "default" as const,
  mensagens: [{ role: "user" as const, content: "x" }],
  schema,
  nomeSchema: "teste",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "sk-teste";
  delete process.env.OPENAI_MODEL_DEFAULT;
  delete process.env.IA_TETO_MENSAL_USD;
  m.empresa.mockResolvedValue({ configuracoes: null });
  m.aggregate.mockResolvedValue({ _sum: { custoUsd: new Prisma.Decimal("0") } });
  m.usoCreate.mockResolvedValue({});
});
afterEach(() => {
  delete process.env.OPENAI_API_KEY;
});

describe("Structured Outputs (json_schema strict + Zod)", () => {
  it("pede json_schema strict e devolve o objeto validado", async () => {
    m.create.mockResolvedValue(resposta({ content: '{"nome":"Pastilha","confianca":0.9,"marca":null}' }));
    const r = await chamarEstruturado(base);
    expect(r).toEqual({ nome: "Pastilha", confianca: 0.9, marca: null });
    const params = m.create.mock.calls[0][0];
    expect(params.response_format.type).toBe("json_schema");
    expect(params.response_format.json_schema.strict).toBe(true);
    expect(params.model).toBe("gpt-6.1-terra");
    expect(params.reasoning_effort).toBe("low");
  });

  it("não envia reasoning_effort quando o modelo vem do env e é gpt-4o", async () => {
    process.env.OPENAI_MODEL_DEFAULT = "gpt-4o";
    m.create.mockResolvedValue(resposta({ content: '{"nome":"a","confianca":1,"marca":"Bosch"}' }));
    await chamarEstruturado(base);
    const params = m.create.mock.calls[0][0];
    expect(params.model).toBe("gpt-4o");
    expect(params).not.toHaveProperty("reasoning_effort");
  });

  it("recusa do modelo vira erro 422 claro", async () => {
    m.create.mockResolvedValue(resposta({ refusal: "Não posso ajudar com isso." }));
    await expect(chamarEstruturado(base)).rejects.toMatchObject({
      status: 422,
      message: "A IA recusou o pedido: Não posso ajudar com isso.",
    });
  });

  it("JSON fora do schema é rejeitado (nada passa adiante)", async () => {
    m.create.mockResolvedValue(resposta({ content: '{"nome":"x","confianca":"alta"}' }));
    await expect(chamarEstruturado(base)).rejects.toMatchObject({ status: 502 });
  });

  it("resposta cortada por tamanho é rejeitada", async () => {
    const r = resposta({ content: '{"nome":"x"' });
    r.choices[0].finish_reason = "length";
    m.create.mockResolvedValue(r);
    await expect(chamarEstruturado(base)).rejects.toMatchObject({ status: 502 });
  });
});

describe("custo e teto por empresa", () => {
  it("registra tokens e custo da chamada na empresa certa", async () => {
    m.create.mockResolvedValue(resposta({ content: '{"nome":"a","confianca":1,"marca":null}' }));
    await chamarEstruturado(base);
    const data = m.usoCreate.mock.calls[0][0].data;
    expect(data.empresaId).toBe("emp-A");
    expect(data.recurso).toBe("vision");
    expect(data.tokensEntrada).toBe(800);
    expect(data.tokensCache).toBe(200);
    expect(data.tokensSaida).toBe(500);
    // gpt-6.1-terra: 800×1 + 200×0,05 + 500×5 = 3.310 US$/1M → US$ 0,00331
    expect(data.custoUsd.toString()).toBe("0.00331");
  });

  it("bloqueia antes de chamar a OpenAI quando o gasto do mês atingiu o teto", async () => {
    process.env.IA_TETO_MENSAL_USD = "20";
    m.aggregate.mockResolvedValue({ _sum: { custoUsd: new Prisma.Decimal("20.00000001") } });
    const p = chamarEstruturado(base);
    await expect(p).rejects.toBeInstanceOf(ErroIA);
    await expect(p).rejects.toMatchObject({ status: 429 });
    await expect(p).rejects.toThrow(/limite mensal de uso da IA \(US\$ 20\.00\)/);
    expect(m.create).not.toHaveBeenCalled();
  });

  it("teto da loja (configuracoes) sobrepõe o env", async () => {
    process.env.IA_TETO_MENSAL_USD = "100";
    m.empresa.mockResolvedValue({ configuracoes: { iaTetoMensalUsd: 5 } });
    m.aggregate.mockResolvedValue({ _sum: { custoUsd: new Prisma.Decimal("5") } });
    await expect(chamarEstruturado(base)).rejects.toMatchObject({ status: 429 });
    expect(m.create).not.toHaveBeenCalled();
  });

  it("abaixo do teto, chama normalmente", async () => {
    m.aggregate.mockResolvedValue({ _sum: { custoUsd: new Prisma.Decimal("19.99") } });
    m.create.mockResolvedValue(resposta({ content: '{"nome":"a","confianca":1,"marca":null}' }));
    await expect(chamarEstruturado(base)).resolves.toBeTruthy();
  });

  it("teto 0 desliga a IA da loja", async () => {
    m.empresa.mockResolvedValue({ configuracoes: { iaTetoMensalUsd: "0" } });
    await expect(chamarEstruturado(base)).rejects.toMatchObject({ status: 403 });
    expect(m.create).not.toHaveBeenCalled();
  });

  it("sem chave da OpenAI, erro 503 sem tentar chamar", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(chamarEstruturado(base)).rejects.toMatchObject({ status: 503 });
    expect(m.create).not.toHaveBeenCalled();
  });
});
