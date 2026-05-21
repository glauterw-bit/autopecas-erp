import { Worker } from "bullmq";
import { prisma } from "@/lib/db";
import { gerarInsightsRupturaEmpresa } from "@/lib/ai/prediction";
import { connection } from "../queues";

export const stockPredictWorker = new Worker<{ empresaId?: string }>(
  "ai:stockpredict",
  async (job) => {
    const empresas = job.data.empresaId
      ? [{ id: job.data.empresaId }]
      : await prisma.empresa.findMany({ select: { id: true } });
    const results = [];
    for (const e of empresas) {
      const criados = await gerarInsightsRupturaEmpresa(e.id);
      results.push({ empresaId: e.id, insightsCriados: criados });
    }
    return results;
  },
  { connection, concurrency: 1 },
);
