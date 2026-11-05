import fs from "node:fs";
import path from "node:path";
import IORedis from "ioredis";
import { prisma } from "../db";
import { validarEnvs } from "./env";

// Saúde completa do sistema. Usada pela rota /api/health/detalhado e pelo job
// de alerta do worker (mesma verificação, mesmos limites).

export const FILAS = [
  "marketplaces:sync", "ai:stockpredict", "ai:marginguard", "ia:ocr-nf",
  "catalogo:tecdoc", "comms:whatsapp", "comms:push", "fiscal:nfe-consulta", "ops:saude",
];
export const CHAVE_HEARTBEAT = "autopecas:worker:heartbeat";
export const HEARTBEAT_MAX_MS = 3 * 60_000;
export const NOTA_PRESA_MIN = 30;
export const FILA_FALHAS_MAX = 20;
export const FILA_ESPERA_MAX = 500;

export type ItemSaude = { nome: string; ok: boolean; detalhe: string; dados?: unknown };

export function avaliarHeartbeat(ts: number | null, agora = Date.now()): ItemSaude {
  if (ts === null) return { nome: "worker", ok: false, detalhe: "Nenhum sinal do worker. Ele está rodando?" };
  const idade = agora - ts;
  return idade > HEARTBEAT_MAX_MS
    ? { nome: "worker", ok: false, detalhe: `Último sinal há ${Math.round(idade / 60000)} min` }
    : { nome: "worker", ok: true, detalhe: `Último sinal há ${Math.round(idade / 1000)} s` };
}

async function medir<T>(nome: string, fn: () => Promise<ItemSaude>): Promise<ItemSaude> {
  try {
    return await fn();
  } catch (e) {
    return { nome, ok: false, detalhe: `Falhou: ${(e as Error).message.split("\n")[0].slice(0, 120)}` };
  }
}

function migracoesNoDisco(): string[] | null {
  try {
    const dir = path.join(process.cwd(), "prisma", "migrations");
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return null;
  }
}

async function checarRedis(url: string): Promise<ItemSaude[]> {
  const r = new IORedis(url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2000, enableOfflineQueue: false });
  r.on("error", () => {});
  const itens: ItemSaude[] = [];
  try {
    await r.connect();
    const t0 = Date.now();
    await r.ping();
    itens.push({ nome: "redis", ok: true, detalhe: `${Date.now() - t0} ms` });

    const hb = await r.get(CHAVE_HEARTBEAT);
    itens.push(avaliarHeartbeat(hb ? Number(hb) : null));

    const filas: Record<string, { espera: number; falhas: number }> = {};
    for (const f of FILAS) {
      const [espera, falhas] = await Promise.all([r.llen(`bull:${f}:wait`), r.zcard(`bull:${f}:failed`)]);
      filas[f] = { espera, falhas };
    }
    const ruins = Object.entries(filas).filter(([, v]) => v.falhas > FILA_FALHAS_MAX || v.espera > FILA_ESPERA_MAX);
    itens.push({
      nome: "filas",
      ok: ruins.length === 0,
      detalhe: ruins.length ? `Com problema: ${ruins.map(([n]) => n).join(", ")}` : "Filas normais",
      dados: filas,
    });
  } catch (e) {
    itens.push({ nome: "redis", ok: false, detalhe: `Sem conexão: ${(e as Error).message.split("\n")[0].slice(0, 100)}` });
  } finally {
    r.disconnect();
  }
  return itens;
}

export async function coletarSaude(env: Record<string, string | undefined> = process.env) {
  const itens: ItemSaude[] = [];

  itens.push(
    await medir("banco", async () => {
      const t0 = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      const ms = Date.now() - t0;
      return { nome: "banco", ok: ms < 2000, detalhe: `${ms} ms`, dados: { latenciaMs: ms } };
    }),
  );

  itens.push(
    await medir("migracoes", async () => {
      const disco = migracoesNoDisco();
      if (!disco) return { nome: "migracoes", ok: true, detalhe: "Pasta de migrações não encontrada aqui; não verificado" };
      const feitas = await prisma.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
      const ok = new Set(feitas.map((m) => m.migration_name));
      const pendentes = disco.filter((n) => !ok.has(n));
      return {
        nome: "migracoes",
        ok: pendentes.length === 0,
        detalhe: pendentes.length ? `${pendentes.length} pendente(s): ${pendentes.slice(0, 5).join(", ")}` : "Em dia",
      };
    }),
  );

  if (env.REDIS_URL) {
    itens.push(...(await checarRedis(env.REDIS_URL)));
  } else {
    itens.push({ nome: "redis", ok: true, detalhe: "REDIS_URL não configurado (filas e worker desligados)" });
  }

  itens.push(
    await medir("notas_presas", async () => {
      const limite = new Date(Date.now() - NOTA_PRESA_MIN * 60_000);
      const n = await prisma.notaFiscal.count({ where: { status: "EMITINDO", dataEmissao: { lt: limite } } });
      return {
        nome: "notas_presas",
        ok: n === 0,
        detalhe: n ? `${n} nota(s) em EMITINDO há mais de ${NOTA_PRESA_MIN} min` : "Nenhuma",
        dados: { quantidade: n },
      };
    }),
  );

  itens.push(
    await medir("webhooks", async () => {
      const desde = new Date(Date.now() - 24 * 3600_000);
      const n = await prisma.eventoWebhook.count({ where: { status: "ERRO", recebidoEm: { gte: desde } } });
      return {
        nome: "webhooks",
        ok: n < 5,
        detalhe: n ? `${n} evento(s) com erro nas últimas 24h` : "Nenhum erro nas últimas 24h",
        dados: { quantidade: n },
      };
    }),
  );

  const e = validarEnvs(env);
  const faltam = [...e.fatais, ...e.obrigatorias];
  itens.push({
    nome: "envs",
    ok: faltam.length === 0,
    detalhe: faltam.length ? `Obrigatórias faltando: ${faltam.join(", ")}` : "Obrigatórias presentes",
    dados: { obrigatoriasFaltando: faltam, opcionaisFaltando: e.opcionais },
  });

  return { ok: itens.every((i) => i.ok), verificadoEm: new Date().toISOString(), itens };
}
