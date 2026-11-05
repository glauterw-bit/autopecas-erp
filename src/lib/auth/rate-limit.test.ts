import { afterEach, describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import { _definirRedisRateLimit, _limparRateLimitMemoria, permitido, permitidoAsync } from "./rate-limit";

afterEach(() => {
  _limparRateLimitMemoria();
  _definirRedisRateLimit(null);
  delete process.env.REDIS_URL;
});

describe("rate limit em memória", () => {
  it("deixa passar até o limite e bloqueia o seguinte", () => {
    expect(permitido("t:a", 3, 60_000)).toBe(true);
    expect(permitido("t:a", 3, 60_000)).toBe(true);
    expect(permitido("t:a", 3, 60_000)).toBe(true);
    expect(permitido("t:a", 3, 60_000)).toBe(false);
  });
  it("chaves diferentes não se misturam", () => {
    for (let i = 0; i < 2; i++) permitido("t:b", 2, 60_000);
    expect(permitido("t:b", 2, 60_000)).toBe(false);
    expect(permitido("t:c", 2, 60_000)).toBe(true);
  });
  it("a janela expira", async () => {
    expect(permitido("t:d", 1, 20)).toBe(true);
    expect(permitido("t:d", 1, 20)).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(permitido("t:d", 1, 20)).toBe(true);
  });
  it("permitidoAsync sem REDIS_URL usa a memória", async () => {
    expect(await permitidoAsync("t:e", 1, 60_000)).toBe(true);
    expect(await permitidoAsync("t:e", 1, 60_000)).toBe(false);
  });
});

function redisFalso(falhar = false) {
  const contadores = new Map<string, number>();
  return {
    multi() {
      let chave = "";
      const cadeia = {
        incr(k: string) {
          chave = k;
          return cadeia;
        },
        pexpire() {
          return cadeia;
        },
        async exec() {
          if (falhar) throw new Error("redis fora");
          const n = (contadores.get(chave) ?? 0) + 1;
          contadores.set(chave, n);
          return [[null, n], [null, 1]];
        },
      };
      return cadeia;
    },
  } as unknown as Redis;
}

describe("rate limit com Redis", () => {
  it("conta no Redis (compartilhado entre instâncias)", async () => {
    process.env.REDIS_URL = "redis://falso";
    _definirRedisRateLimit(redisFalso());
    expect(await permitidoAsync("r:a", 2, 60_000)).toBe(true);
    expect(await permitidoAsync("r:a", 2, 60_000)).toBe(true);
    expect(await permitidoAsync("r:a", 2, 60_000)).toBe(false);
  });
  it("Redis fora do ar cai para a memória, sem lançar erro", async () => {
    process.env.REDIS_URL = "redis://falso";
    _definirRedisRateLimit(redisFalso(true));
    expect(await permitidoAsync("r:b", 1, 60_000)).toBe(true);
    expect(await permitidoAsync("r:b", 1, 60_000)).toBe(false);
  });
});
