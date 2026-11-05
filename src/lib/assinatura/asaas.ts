// Cliente mínimo da API v3 do Asaas (cobrança da assinatura do SaaS).
// Documentação: https://docs.asaas.com
//
// Env:
//   ASAAS_API_URL  (padrão: sandbox https://api-sandbox.asaas.com/v3)
//   ASAAS_API_KEY  (chave do sandbox ou de produção; nunca vai para o código)
//   ASAAS_WEBHOOK_TOKEN  (token que o Asaas manda no header asaas-access-token)
//
// Trava de segurança: fora de produção (NODE_ENV !== "production") este
// módulo recusa falar com api.asaas.com. Os testes usam fixtures.

import crypto from "node:crypto";

export const ASAAS_SANDBOX_URL = "https://api-sandbox.asaas.com/v3";

export type FormaCobranca = "BOLETO" | "PIX" | "CREDIT_CARD" | "UNDEFINED";
export type CicloAsaas = "MONTHLY" | "YEARLY";

export class AsaasError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function asaasConfigurado(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.ASAAS_API_KEY;
}

function config(env: Record<string, string | undefined> = process.env) {
  const chave = env.ASAAS_API_KEY;
  if (!chave) throw new AsaasError(503, "Cobrança ainda não configurada (falta ASAAS_API_KEY).");
  const base = (env.ASAAS_API_URL ?? ASAAS_SANDBOX_URL).replace(/\/+$/, "");
  const real = /^https:\/\/api\.asaas\.com(\/|$)/.test(base);
  if (real && env.NODE_ENV !== "production") {
    throw new AsaasError(503, "O Asaas de produção só pode ser usado em produção. Use o sandbox.");
  }
  return { chave, base };
}

async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const { chave, base } = config();
  let r: Response;
  try {
    r = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: {
        "content-type": "application/json",
        access_token: chave,
        "user-agent": "AutoPecasERP/1.0",
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AsaasError(502, "Não consegui falar com o sistema de cobrança agora. Tente de novo em instantes.");
  }
  const texto = await r.text();
  let json: any = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    /* corpo não-JSON */
  }
  if (!r.ok) {
    const desc = json?.errors?.[0]?.description as string | undefined;
    throw new AsaasError(r.status === 401 ? 503 : r.status === 429 ? 429 : 502, desc ?? "O sistema de cobrança recusou o pedido.");
  }
  return json as T;
}

export type ClienteAsaas = { id: string };
export type AssinaturaAsaas = { id: string; status?: string; nextDueDate?: string; cycle?: CicloAsaas; value?: number };
export type CobrancaAsaas = {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  billingType?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
};

export function criarCliente(d: {
  nome: string;
  cnpj: string;
  email: string;
  celular?: string | null;
  empresaId: string;
}) {
  return chamar<ClienteAsaas>("POST", "/customers", {
    name: d.nome,
    cpfCnpj: d.cnpj,
    email: d.email,
    mobilePhone: d.celular || undefined,
    externalReference: d.empresaId,
    notificationDisabled: false,
  });
}

export function criarAssinatura(d: {
  clienteId: string;
  valor: number; // reais; > 0
  ciclo: CicloAsaas;
  forma: FormaCobranca;
  primeiroVencimento: string; // YYYY-MM-DD
  descricao: string;
  empresaId: string;
}) {
  if (!(d.valor > 0)) throw new AsaasError(422, "O preço deste plano ainda não foi definido.");
  return chamar<AssinaturaAsaas>("POST", "/subscriptions", {
    customer: d.clienteId,
    billingType: d.forma,
    value: d.valor,
    nextDueDate: d.primeiroVencimento,
    cycle: d.ciclo,
    description: d.descricao,
    externalReference: d.empresaId,
  });
}

export function atualizarAssinatura(id: string, d: { valor: number; ciclo: CicloAsaas; forma: FormaCobranca }) {
  if (!(d.valor > 0)) throw new AsaasError(422, "O preço deste plano ainda não foi definido.");
  return chamar<AssinaturaAsaas>("PUT", `/subscriptions/${encodeURIComponent(id)}`, {
    value: d.valor,
    cycle: d.ciclo,
    billingType: d.forma,
    updatePendingPayments: true,
  });
}

export function cancelarAssinaturaAsaas(id: string) {
  return chamar<{ deleted?: boolean }>("DELETE", `/subscriptions/${encodeURIComponent(id)}`);
}

export async function listarCobrancas(assinaturaId: string): Promise<CobrancaAsaas[]> {
  const r = await chamar<{ data?: CobrancaAsaas[] }>(
    "GET",
    `/subscriptions/${encodeURIComponent(assinaturaId)}/payments?limit=12`,
  );
  return r?.data ?? [];
}

/** Compara o token do webhook em tempo constante. Sem token configurado, recusa tudo. */
export function tokenWebhookValido(recebido: string | null, esperado = process.env.ASAAS_WEBHOOK_TOKEN): boolean {
  if (!esperado || !recebido) return false;
  const a = crypto.createHash("sha256").update(recebido).digest();
  const b = crypto.createHash("sha256").update(esperado).digest();
  return crypto.timingSafeEqual(a, b);
}
