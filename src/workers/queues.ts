import { Queue, type QueueOptions } from "bullmq";
import IORedis from "ioredis";

// Filas BullMQ
// ============
// Cada fila tem semântica de jobs específica. Uso de Redis com TLS exigido
// pelo Railway/Heroku Redis. Conexões singleton para evitar pool inflado.

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null, // requerido pelo BullMQ
  enableReadyCheck: false,
});

const defaults: QueueOptions = {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
  },
};

export const queues = {
  marketplaces: new Queue("marketplaces:sync", defaults),
  stockpredict: new Queue("ai:stockpredict", defaults),
  marginguard:  new Queue("ai:marginguard",  defaults),
  ocrnf:        new Queue("ia:ocr-nf",       defaults),
  tecdoc:       new Queue("catalogo:tecdoc", defaults),
  whatsapp:     new Queue("comms:whatsapp",  defaults),
  notificacoes: new Queue("comms:push",      defaults),
} as const;

export type FilaNome = keyof typeof queues;
