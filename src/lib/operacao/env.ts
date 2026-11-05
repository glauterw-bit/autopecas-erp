// Validação das variáveis de ambiente. Só devolve NOMES, nunca valores.

type Regra = { nome: string; minimo?: number };

// Sem estas o sistema não funciona. DATABASE_URL derruba o boot; as outras
// aparecem como erro claro no log e no health detalhado.
export const ENVS_FATAIS: Regra[] = [{ nome: "DATABASE_URL" }];
export const ENVS_OBRIGATORIAS: Regra[] = [
  { nome: "SESSION_SECRET", minimo: 32 },
  { nome: "WEBHOOK_TOKEN" },
  { nome: "APP_URL" },
];
// Recursos que ficam desligados sem elas. Avisa, não derruba.
export const ENVS_OPCIONAIS: string[] = [
  "REDIS_URL",
  "FOCUS_NFE_TOKEN",
  "FOCUS_WEBHOOK_TOKEN",
  "META_APP_SECRET",
  "ML_STATE_SECRET",
  "OPENAI_API_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "S3_BUCKET",
  "SENTRY_DSN",
  "ALERTA_WEBHOOK_URL",
  "HEALTH_TOKEN",
  "SUPORTE_WHATSAPP",
  "SUPORTE_EMAIL",
];

type Env = Record<string, string | undefined>;

function faltando(regras: Regra[], env: Env): string[] {
  return regras
    .filter((r) => {
      const v = env[r.nome]?.trim();
      return !v || (r.minimo !== undefined && v.length < r.minimo);
    })
    .map((r) => r.nome);
}

export function validarEnvs(env: Env = process.env) {
  return {
    fatais: faltando(ENVS_FATAIS, env),
    obrigatorias: faltando(ENVS_OBRIGATORIAS, env),
    opcionais: ENVS_OPCIONAIS.filter((n) => !env[n]?.trim()),
  };
}
