import { permitidoAsync } from "../auth/rate-limit";
import { ErroIA } from "./uso";

// Rate limit das rotas /api/ia/*. Usa `permitidoAsync` (src/lib/auth/rate-limit.ts):
// Redis quando há REDIS_URL (vale para todas as instâncias), memória local sem ele.
export const LIMITES_IA = {
  chat: { limite: 20, janelaMs: 60_000 },
  vision: { limite: 10, janelaMs: 60_000 },
  ocrNf: { limite: 10, janelaMs: 60_000 },
  crossReference: { limite: 30, janelaMs: 60_000 },
  previsao: { limite: 30, janelaMs: 60_000 },
  previsaoLote: { limite: 2, janelaMs: 10 * 60_000 },
  insights: { limite: 60, janelaMs: 60_000 },
  whatsapp: { limite: 10, janelaMs: 60_000 },
} as const;

export async function exigirLimiteIA(recurso: keyof typeof LIMITES_IA, chave: string) {
  const { limite, janelaMs } = LIMITES_IA[recurso];
  if (!(await permitidoAsync(`ia:${recurso}:${chave}`, limite, janelaMs))) {
    throw new ErroIA(429, "Muitas consultas à IA em pouco tempo. Aguarde um minuto e tente de novo.");
  }
}
