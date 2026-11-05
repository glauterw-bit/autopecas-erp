import { describe, it, expect, vi } from "vitest";

vi.mock("../db", () => ({ prisma: {} }));

import { custoEstimadoUsd, inicioDoMesSaoPaulo } from "./uso";
import { modeloPara, precoDoModelo, PRECO_DESCONHECIDO } from "./client";

describe("custo estimado (Decimal, sem float)", () => {
  it("gpt-6-luna: 1M de entrada + 1M de saída = US$ 0,60", () => {
    const c = custoEstimadoUsd("gpt-6-luna", { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 });
    expect(c.custo.toString()).toBe("0.6");
  });
  it("tokens de cache saem pelo preço de cache", () => {
    const c = custoEstimadoUsd("gpt-4o-mini", {
      prompt_tokens: 2000,
      completion_tokens: 0,
      prompt_tokens_details: { cached_tokens: 2000 },
    });
    // 2000 × 0,075 / 1M
    expect(c.custo.toString()).toBe("0.00015");
    expect(c.tokensEntrada).toBe(0);
  });
  it("snapshot datado usa o preço do alias; modelo desconhecido usa o mais caro", () => {
    expect(precoDoModelo("gpt-4o-mini-2024-07-18").entrada).toBe("0.15");
    expect(precoDoModelo("gpt-4o-2024-11-20").entrada).toBe("2.50");
    expect(precoDoModelo("modelo-novo")).toBe(PRECO_DESCONHECIDO);
  });
  it("modelos padrão não usam os que desligam em 14/01/2027 e aceitam override", () => {
    expect(modeloPara("default")).not.toMatch(/^gpt-4o/);
    expect(modeloPara("fast")).not.toMatch(/^gpt-4o/);
    process.env.OPENAI_MODEL_FAST = "gpt-5.6-luna";
    expect(modeloPara("fast")).toBe("gpt-5.6-luna");
    delete process.env.OPENAI_MODEL_FAST;
  });
});

describe("mês do teto no fuso de São Paulo", () => {
  it("01/11 às 02h UTC ainda é outubro em São Paulo", () => {
    expect(inicioDoMesSaoPaulo(new Date("2026-11-01T02:00:00Z")).toISOString()).toBe(
      "2026-10-01T03:00:00.000Z",
    );
  });
  it("01/11 às 03h UTC já é novembro", () => {
    expect(inicioDoMesSaoPaulo(new Date("2026-11-01T03:00:00Z")).toISOString()).toBe(
      "2026-11-01T03:00:00.000Z",
    );
  });
});
