// Rate limiting
// =============
// Duas formas, mesma regra (no máximo `limite` acertos por `janelaMs`):
//
// - `permitido(chave, limite, janelaMs)`: síncrona, em memória (janela
//   deslizante). Continua existindo porque várias rotas já a chamam. Vale só
//   para a instância atual e zera a cada deploy.
// - `permitidoAsync(chave, limite, janelaMs)`: usa Redis quando REDIS_URL
//   existe (contador por janela fixa com INCR + PEXPIRE, atômico via MULTI),
//   e por isso vale para todas as instâncias. Sem REDIS_URL, ou se o Redis
//   falhar, cai para a mesma memória da `permitido` (fail-open controlado:
//   o limite local continua valendo).
//
// Prefira `permitidoAsync` em rota nova (login, IA, rotas caras).

import type { Redis } from "ioredis";

const janelas = new Map<string, number[]>();

export function permitido(chave: string, limite: number, janelaMs: number): boolean {
  const agora = Date.now();
  const hits = (janelas.get(chave) ?? []).filter((t) => agora - t < janelaMs);
  if (hits.length >= limite) {
    janelas.set(chave, hits);
    return false;
  }
  hits.push(agora);
  janelas.set(chave, hits);
  // Limpeza oportunista pra não crescer sem limite
  if (janelas.size > 10_000) {
    for (const [k, v] of janelas) {
      if (v.every((t) => agora - t >= janelaMs)) janelas.delete(k);
    }
  }
  return true;
}

/** Só para testes: zera a memória do limitador. */
export function _limparRateLimitMemoria() {
  janelas.clear();
}

// Conexão própria, preguiçosa e com timeout curto: o rate limit nunca pode
// travar uma requisição esperando o Redis. Não reaproveita a conexão do
// BullMQ (maxRetriesPerRequest: null faria a chamada esperar para sempre).
let redis: Redis | null = null;
let redisIndisponivelAte = 0;

async function clienteRedis(): Promise<Redis | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (Date.now() < redisIndisponivelAte) return null;
  if (!redis) {
    const { default: IORedis } = await import("ioredis");
    redis = new IORedis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
      commandTimeout: 500,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    redis.on("error", () => {
      // Silencioso: o fallback em memória assume. Nada de URL em log.
    });
  }
  return redis;
}

/** Testes podem injetar um cliente Redis falso (ou null para forçar memória). */
export function _definirRedisRateLimit(cliente: Redis | null) {
  redis = cliente;
  redisIndisponivelAte = 0;
}

export async function permitidoAsync(
  chave: string,
  limite: number,
  janelaMs: number,
): Promise<boolean> {
  const cli = await clienteRedis();
  if (!cli) return permitido(chave, limite, janelaMs);
  try {
    // Janela fixa alinhada no tempo: a chave muda a cada janela, então não
    // depende de PEXPIRE ter funcionado para "zerar" o contador.
    const janela = Math.floor(Date.now() / janelaMs);
    const k = `rl:${chave}:${janela}`;
    const res = await cli.multi().incr(k).pexpire(k, janelaMs).exec();
    const contagem = Number(res?.[0]?.[1]);
    if (!Number.isFinite(contagem)) throw new Error("resposta inválida");
    return contagem <= limite;
  } catch {
    // Redis caiu: 30 s sem tentar, para não somar timeout em toda requisição.
    redisIndisponivelAte = Date.now() + 30_000;
    return permitido(chave, limite, janelaMs);
  }
}
