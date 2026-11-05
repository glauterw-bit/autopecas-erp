import { enviarEmail } from "../auth/email";
import type { ItemSaude } from "./saude";

// Alerta: webhook genérico (ALERTA_WEBHOOK_URL) e/ou e-mail (ALERTA_EMAIL + Resend).
// Não repete o mesmo problema em menos de 1 h.

export const ALERTA_INTERVALO_MS = 60 * 60_000;

/** Decide o que enviar agora. `ultimos` guarda quando cada problema foi avisado. */
export function filtrarAlertas(
  problemas: ItemSaude[],
  ultimos: Map<string, number>,
  agora = Date.now(),
): ItemSaude[] {
  const novos: ItemSaude[] = [];
  const chavesAtuais = new Set<string>();
  for (const p of problemas) {
    // A chave inclui o texto: um problema que muda de natureza avisa de novo.
    const chave = `${p.nome}:${p.detalhe}`;
    chavesAtuais.add(chave);
    const ult = ultimos.get(chave);
    if (ult === undefined || agora - ult >= ALERTA_INTERVALO_MS) {
      novos.push(p);
      ultimos.set(chave, agora);
    }
  }
  // Problema que sumiu é esquecido: se voltar, avisa de novo.
  for (const k of [...ultimos.keys()]) if (!chavesAtuais.has(k)) ultimos.delete(k);
  return novos;
}

export function montarMensagem(problemas: ItemSaude[]): string {
  return `AutoPeças ERP: ${problemas.length} problema(s)\n` + problemas.map((p) => `- ${p.nome}: ${p.detalhe}`).join("\n");
}

/**
 * Formato do webhook: POST JSON com os campos "content" (Discord), "text" (Slack)
 * e "message" (ntfy.sh em JSON) iguais ao texto. ntfy.sh por URL simples
 * (https://ntfy.sh/seu-topico) também recebe o corpo JSON; para texto puro use o
 * tópico via Slack/Discord. Documentado em docs/OPERACAO.md.
 */
export function corpoWebhook(texto: string) {
  return { content: texto, text: texto, message: texto, title: "AutoPeças ERP" };
}

export async function enviarAlerta(texto: string): Promise<{ webhook: boolean; email: boolean }> {
  const out = { webhook: false, email: false };
  const url = process.env.ALERTA_WEBHOOK_URL;
  if (url) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpoWebhook(texto)),
        signal: AbortSignal.timeout(5000),
      });
      out.webhook = r.ok;
    } catch { /* tenta o e-mail */ }
  }
  const para = process.env.ALERTA_EMAIL;
  if (para) out.email = await enviarEmail(para, "AutoPeças ERP: alerta de operação", texto);
  return out;
}
