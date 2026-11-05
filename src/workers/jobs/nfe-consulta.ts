import { Worker } from "bullmq";
import { sincronizarPendentes } from "@/lib/nfe/sincronizar";
import { connection } from "../queues";

// Consulta na Focus as notas EMITINDO (a NF-e 55 é assíncrona) cuja próxima
// consulta venceu: espaçadas em 1, 5, 15 e 60 min e depois de hora em hora; após
// 24 h vai para revisão com alerta; 401/403 para e alerta. Limite por rodada e
// por empresa. Regras em src/lib/nfe/sincronizar.ts.
export const nfeConsultaWorker = new Worker<{ limite?: number }>(
  "fiscal:nfe-consulta",
  async (job) => {
    const r = await sincronizarPendentes({ limite: job.data.limite ?? 50, idadeMinMs: 60_000 });
    return { consultadas: r.length, mudaram: r.filter((x) => "mudou" in x && x.mudou).length };
  },
  { connection, concurrency: 1 },
);
