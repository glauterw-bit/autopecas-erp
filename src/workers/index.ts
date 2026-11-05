// Entry point dos workers — chamado por `npm run worker`.
// Roda em processo separado do Next.js (segundo container no Railway).
//
// Schedulers (BullMQ Repeat):
//   - sync de marketplaces: a cada 15 min
//   - StockPredict batch: 3h da manhã
//   - MarginGuard batch: 4h da manhã
//   - TecDoc sync: dia 1 às 2h
//   - Saúde + alerta: a cada 5 min (e heartbeat a cada 30 s)
//   - Consulta de NF-e em processamento na Focus: a cada minuto
//
// Cada worker é autônomo: monta o handler e registra-se no Redis.

import { queues } from "./queues";
import { syncMarketplacesWorker } from "./jobs/sync-marketplaces";
import { stockPredictWorker } from "./jobs/stockpredict";
import { marginGuardWorker } from "./jobs/margin-guard";
import { tecdocCronWorker } from "./jobs/tecdoc-cron";
import { nfeConsultaWorker } from "./jobs/nfe-consulta";
import { saudeAlertaWorker, iniciarHeartbeat } from "./jobs/saude-alerta";
import { registrarErro } from "@/lib/observabilidade";

async function agendarSchedulers() {
  await queues.marketplaces.add(
    "sync-todas",
    {},
    { repeat: { pattern: "*/15 * * * *" }, jobId: "sched:marketplaces-15min" },
  );
  await queues.stockpredict.add(
    "noturno",
    {},
    { repeat: { pattern: "0 3 * * *" }, jobId: "sched:stockpredict-3h" },
  );
  await queues.marginguard.add(
    "noturno",
    {},
    { repeat: { pattern: "0 4 * * *" }, jobId: "sched:marginguard-4h" },
  );
  await queues.tecdoc.add(
    "mensal",
    {},
    { repeat: { pattern: "0 2 1 * *" }, jobId: "sched:tecdoc-mensal" },
  );
  await queues.nfeconsulta.add(
    "pendentes",
    { limite: 50 },
    { repeat: { pattern: "* * * * *" }, jobId: "sched:nfe-consulta-1min" },
  );
  await queues.saude.add(
    "verificar",
    {},
    { repeat: { pattern: "*/5 * * * *" }, jobId: "sched:saude-5min" },
  );
}

async function main() {
  console.log("[workers] Iniciando workers BullMQ...");
  await agendarSchedulers();
  console.log("[workers] Schedulers registrados:");
  console.log("  - marketplaces:sync   a cada 15 min");
  console.log("  - ai:stockpredict     03:00 diariamente");
  console.log("  - ai:marginguard      04:00 diariamente");
  console.log("  - catalogo:tecdoc     02:00 dia 1 de cada mês");
  console.log("  - fiscal:nfe-consulta a cada minuto (notas EMITINDO com consulta vencida, até 50; espaçadas 1/5/15/60 min)");

  const workers = [
    syncMarketplacesWorker,
    stockPredictWorker,
    marginGuardWorker,
    tecdocCronWorker,
    nfeConsultaWorker,
    saudeAlertaWorker,
  ];
  iniciarHeartbeat();

  // Logs de eventos
  for (const w of workers) {
    w.on("completed", (job) => console.log(`[${w.name}] ✓ ${job.id}`));
    w.on("failed", (job, err) => registrarErro(err, { rota: `worker:${w.name}`, extra: { jobId: job?.id } }));
    w.on("error", (err) => registrarErro(err, { rota: `worker:${w.name}` }));
  }

  // Graceful shutdown
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, async () => {
      console.log(`[workers] Recebido ${sig}, encerrando...`);
      await Promise.all(workers.map((w) => w.close()));
      process.exit(0);
    });
  }
}

main().catch((e) => {
  registrarErro(e, { rota: "worker:main", nivel: "fatal" });
  process.exit(1);
});
