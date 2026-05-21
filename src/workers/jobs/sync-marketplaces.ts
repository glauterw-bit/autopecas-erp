import { Worker, type Job } from "bullmq";
import { prisma } from "@/lib/db";
import { sincronizarConta } from "@/lib/marketplaces/unified";
import { connection } from "../queues";

interface SyncJob {
  contaId?: string;     // se omitido, sincroniza todas as contas ativas
  empresaId?: string;
}

export const syncMarketplacesWorker = new Worker<SyncJob>(
  "marketplaces:sync",
  async (job: Job<SyncJob>) => {
    const { contaId, empresaId } = job.data;
    if (contaId) {
      return await sincronizarConta(contaId);
    }
    const contas = await prisma.marketplaceConta.findMany({
      where: { ativa: true, ...(empresaId && { empresaId }) },
      select: { id: true },
    });
    const results = [];
    for (const c of contas) {
      try {
        results.push({ contaId: c.id, ...(await sincronizarConta(c.id)) });
      } catch (e) {
        results.push({ contaId: c.id, erro: (e as Error).message });
      }
    }
    return results;
  },
  { connection, concurrency: 4 },
);
