import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { mascararParaLog } from "./auth/auditoria";

// Erros visíveis: log em JSON (uma linha) + Sentry opcional por HTTP, sem SDK.
// Nunca grava dado pessoal: CPF/CNPJ (mascararParaLog), e-mail e telefone.

export type ContextoErro = {
  rota?: string;
  empresaId?: string;
  requestId?: string;
  nivel?: "error" | "warning" | "fatal";
  extra?: Record<string, unknown>;
};

const armazem = new AsyncLocalStorage<{ requestId: string }>();

export function novoRequestId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}
export function comRequestId<T>(requestId: string, fn: () => T): T {
  return armazem.run({ requestId }, fn);
}
export function requestIdAtual(): string | undefined {
  return armazem.getStore()?.requestId;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const TELEFONE = /\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g;

export function limparTexto(s: string): string {
  const m = mascararParaLog(s) as string;
  return m.replace(EMAIL, "***@***").replace(TELEFONE, "***");
}

function limparExtra(extra?: Record<string, unknown>): unknown {
  if (!extra) return undefined;
  const lim = (v: unknown): unknown =>
    typeof v === "string" ? limparTexto(v) : v && typeof v === "object" ? JSON.parse(limparTexto(JSON.stringify(mascararParaLog(v)))) : v;
  return Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, lim(v)]));
}

export function montarRegistro(erro: unknown, ctx: ContextoErro = {}) {
  const e = erro instanceof Error ? erro : new Error(String(erro));
  return {
    ts: new Date().toISOString(),
    nivel: ctx.nivel ?? "error",
    rota: ctx.rota,
    empresaId: ctx.empresaId,
    requestId: ctx.requestId ?? requestIdAtual(),
    tipo: e.name,
    mensagem: limparTexto(e.message),
    stack: e.stack ? limparTexto(e.stack).split("\n").slice(0, 12).join("\n") : undefined,
    extra: limparExtra(ctx.extra),
  };
}

// Converte o DSN do Sentry na URL e no cabeçalho do envelope.
export function dsnSentry(dsn: string) {
  try {
    const u = new URL(dsn);
    const projeto = u.pathname.replace(/^\/+|\/+$/g, "").split("/").pop();
    if (!u.username || !projeto) return null;
    return {
      url: `${u.protocol}//${u.host}/api/${projeto}/envelope/`,
      chave: u.username,
    };
  } catch {
    return null;
  }
}

async function enviarSentry(reg: ReturnType<typeof montarRegistro>) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const d = dsnSentry(dsn);
  if (!d) return;
  const eventId = randomUUID().replace(/-/g, "");
  const evento = {
    event_id: eventId,
    timestamp: reg.ts,
    level: reg.nivel,
    platform: "node",
    environment: process.env.NODE_ENV,
    message: `${reg.tipo}: ${reg.mensagem}`,
    tags: { rota: reg.rota ?? "", requestId: reg.requestId ?? "", empresaId: reg.empresaId ?? "" },
    extra: { stack: reg.stack, ...(reg.extra as object | undefined) },
  };
  const corpo =
    JSON.stringify({ event_id: eventId, sent_at: reg.ts }) + "\n" +
    JSON.stringify({ type: "event" }) + "\n" +
    JSON.stringify(evento) + "\n";
  try {
    await fetch(d.url, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${d.chave}, sentry_client=autopecas-erp/1.0`,
      },
      body: corpo,
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    /* observabilidade nunca derruba a requisição */
  }
}

/** Registra o erro (JSON no stdout) e, se houver SENTRY_DSN, envia sem esperar. */
export function registrarErro(erro: unknown, ctx: ContextoErro = {}) {
  try {
    const reg = montarRegistro(erro, ctx);
    console.error(JSON.stringify(reg));
    void enviarSentry(reg);
    return reg;
  } catch {
    return null;
  }
}
