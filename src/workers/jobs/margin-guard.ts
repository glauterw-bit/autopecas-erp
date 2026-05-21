import { Worker } from "bullmq";
import { prisma } from "@/lib/db";
import { gerarInsightsMargemEmpresa } from "@/lib/ai/margin-guard";
import { connection } from "../queues";

export const marginGuardWorker = new Worker<{ empresaId?: string; dias?: number }>(
  "ai:marginguard",
  async (job) => {
    const empresas = job.data.empresaId
      ? [{ id: job.data.empresaId }]
      : await prisma.empresa.findMany({ select: { id: true } });
    const results = [];
    for (const e of empresas) {
      const criados = await gerarInsightsMargemEmpresa(e.id, job.data.dias ?? 30);
      results.push({ empresaId: e.id, insightsCriados: criados });
    }
    return results;
  },
  { connection, concurrency: 1 },
);
