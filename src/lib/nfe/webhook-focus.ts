import { createHash, timingSafeEqual } from "node:crypto";

// Autenticação do gatilho (webhook) da Focus NFe
// ==============================================
// Ao cadastrar o gatilho (POST /v2/hooks, evento "nfe"), informe
//   authorization = valor de FOCUS_WEBHOOK_TOKEN
//   authorization_header = nome do cabeçalho (padrão "Authorization"; mude com FOCUS_WEBHOOK_HEADER)
// A Focus manda esse valor no cabeçalho escolhido em cada chamada.
// Doc: https://doc.focusnfe.com.br/reference/criar_webhook
//      https://doc.focusnfe.com.br/docs/webhooks (o corpo traz os mesmos dados da consulta)
// Comparação em tempo constante (hash dos dois lados, mesmo tamanho).

export function autenticarWebhookFocus(
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
): { ok: true } | { ok: false; status: 401 | 503 } {
  const segredo = env.FOCUS_WEBHOOK_TOKEN ?? "";
  if (segredo.length < 16) return { ok: false, status: 503 };
  const nome = (env.FOCUS_WEBHOOK_HEADER || "authorization").toLowerCase();
  const recebido = headers.get(nome) ?? "";
  // Aceita "Bearer <token>" ou o token puro.
  const valor = recebido.replace(/^Bearer\s+/i, "");
  const a = createHash("sha256").update(valor).digest();
  const b = createHash("sha256").update(segredo).digest();
  return valor.length > 0 && timingSafeEqual(a, b) ? { ok: true } : { ok: false, status: 401 };
}
