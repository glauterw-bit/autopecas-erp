import { Worker } from "bullmq";
import { connection } from "../queues";
import { coletarSaude, CHAVE_HEARTBEAT } from "@/lib/operacao/saude";
import { enviarAlerta, filtrarAlertas, montarMensagem } from "@/lib/operacao/alerta";

// A cada 5 min: roda a mesma checagem do /api/health/detalhado e avisa se algo
// estiver ruim (sem repetir o mesmo aviso em menos de 1 h).
const ultimos = new Map<string, number>();

export const saudeAlertaWorker = new Worker(
  "ops:saude",
  async () => {
    const s = await coletarSaude();
    const ruins = s.itens.filter((i) => !i.ok);
    const novos = filtrarAlertas(ruins, ultimos);
    if (novos.length) await enviarAlerta(montarMensagem(novos));
    return { problemas: ruins.length, avisados: novos.length };
  },
  { connection, concurrency: 1 },
);

// Sinal de vida do worker, lido pelo health. Expira sozinho se o worker morrer.
export function iniciarHeartbeat() {
  const bater = () => void connection.set(CHAVE_HEARTBEAT, String(Date.now()), "EX", 300).catch(() => {});
  bater();
  return setInterval(bater, 30_000);
}
