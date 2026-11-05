import { Worker, type Job } from "bullmq";
import { prisma } from "@/lib/db";
import { sincronizarConta } from "@/lib/marketplaces/unified";
import { processarEventoWebhook, processarEventosPendentes } from "@/lib/marketplaces/processar-evento";
import { connection } from "../queues";

interface SyncJob {
  contaId?: string;     // se omitido, sincroniza todas as contas ativas
  empresaId?: string;
  eventoId?: string;    // job "webhook": processa um EventoWebhook
}

export const syncMarketplacesWorker = new Worker<SyncJob>(
  "marketplaces:sync",
  async (job: Job<SyncJob>) => {
    if (job.name === "webhook") {
      // Formato antigo (payload sem eventoId) é descartado: não há tenant.
      if (!job.data.eventoId) return { ignorado: true };
      return { resultado: await processarEventoWebhook(job.data.eventoId) };
    }
    const { contaId, empresaId } = job.data;
    if (contaId) {
      return await sincronizarConta(contaId);
    }
    // Eventos que ficaram pendentes (fila fora do ar na hora do webhook).
    const eventos = await processarEventosPendentes();
    const contas = await prisma.marketplaceConta.findMany({
      where: { ativa: true, ...(empresaId && { empresaId }) },
      select: { id: true },
    });
    const results: Array<Record<string, unknown>> = [{ eventos }];
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
