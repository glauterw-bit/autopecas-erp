import { Worker } from "bullmq";
import { sincronizarPendentes } from "@/lib/nfe/sincronizar";
import { connection } from "../queues";

// Consulta na Focus as notas que estão EMITINDO há mais de 1 minuto (a NF-e 55
// é assíncrona). Limite por rodada para não estourar a Focus; as mais antigas
// primeiro. Regras em src/lib/nfe/sincronizar.ts.
export const nfeConsultaWorker = new Worker<{ limite?: number }>(
  "fiscal:nfe-consulta",
  async (job) => {
    const r = await sincronizarPendentes({ limite: job.data.limite ?? 50, idadeMinMs: 60_000 });
    return { consultadas: r.length, mudaram: r.filter((x) => "mudou" in x && x.mudou).length };
  },
  { connection, concurrency: 1 },
);
