import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";
import { calcularEspera, comRetryML, listarIdsPorScan, type PaginaScan } from "./ml-http";

function erroHttp(status: number, retryAfter?: string) {
  const headers = new AxiosHeaders();
  if (retryAfter) headers.set("retry-after", retryAfter);
  return new AxiosError("erro", "ERR", undefined, undefined, {
    status,
    statusText: "",
    headers,
    config: { headers: new AxiosHeaders() },
    data: {},
  });
}

describe("paginação por scan (sem teto de 1.000)", () => {
  it("segue o scroll_id até a página vazia, passando de 1.000 itens", async () => {
    const total = 2_350;
    const chamadas: Array<Record<string, string | number>> = [];
    const buscar = async (params: Record<string, string | number>): Promise<PaginaScan> => {
      chamadas.push(params);
      const pagina = chamadas.length - 1;
      const inicio = pagina * 100;
      const results = Array.from({ length: Math.max(0, Math.min(100, total - inicio)) }, (_, i) => `MLB${inicio + i}`);
      return { results, scroll_id: `scroll-${pagina + 1}`, paging: { total } };
    };
    const ids = await listarIdsPorScan(buscar);
    expect(ids).toHaveLength(total);
    expect(new Set(ids).size).toBe(total);
    expect(chamadas[0]).toEqual({ search_type: "scan", limit: 100 });
    expect(chamadas[1]).toMatchObject({ search_type: "scan", scroll_id: "scroll-1" });
    expect(chamadas.every((c) => !("offset" in c))).toBe(true);
  });
  it("para se a API repetir a mesma página (sem laço infinito)", async () => {
    let n = 0;
    const ids = await listarIdsPorScan(async () => {
      n++;
      return { results: ["A", "B"], scroll_id: "mesmo" };
    });
    expect(ids).toEqual(["A", "B"]);
    expect(n).toBe(2);
  });
});

describe("429 com retry, backoff e jitter", () => {
  it("repete após 429 e devolve o resultado", async () => {
    const esperas: number[] = [];
    let n = 0;
    const r = await comRetryML(
      async () => {
        n++;
        if (n < 3) throw erroHttp(429);
        return "ok";
      },
      { dormir: async (ms) => void esperas.push(ms), aleatorio: () => 0.5 },
    );
    expect(r).toBe("ok");
    expect(n).toBe(3);
    expect(esperas).toEqual([250, 500]); // 0.5 × 500·2^0, 0.5 × 500·2^1
  });
  it("respeita Retry-After em segundos", async () => {
    const esperas: number[] = [];
    let n = 0;
    await comRetryML(
      async () => {
        if (n++ === 0) throw erroHttp(429, "2");
        return 1;
      },
      { dormir: async (ms) => void esperas.push(ms), aleatorio: () => 0 },
    );
    expect(esperas).toEqual([2000]);
  });
  it("desiste após o máximo de tentativas e não repete 400", async () => {
    let n = 0;
    await expect(
      comRetryML(
        async () => {
          n++;
          throw erroHttp(429);
        },
        { maxTentativas: 4, dormir: async () => {} },
      ),
    ).rejects.toBeInstanceOf(AxiosError);
    expect(n).toBe(4);
    let m = 0;
    await expect(
      comRetryML(
        async () => {
          m++;
          throw erroHttp(400);
        },
        { dormir: async () => {} },
      ),
    ).rejects.toBeInstanceOf(AxiosError);
    expect(m).toBe(1);
  });
  it("backoff cresce até o teto e o jitter fica dentro da faixa", () => {
    expect(calcularEspera(1, undefined, { aleatorio: () => 0.999 })).toBeLessThan(500);
    expect(calcularEspera(10, undefined, { aleatorio: () => 0.999 })).toBeLessThanOrEqual(30_000);
    expect(calcularEspera(3, undefined, { aleatorio: () => 0 })).toBe(100); // piso
    expect(calcularEspera(1, "600", { aleatorio: () => 0 })).toBe(60_000); // teto do Retry-After
  });
});
