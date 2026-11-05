// Autenticação do webhook Pix
// ===========================
// O padrão BACEN autentica o callback do PSP por mTLS: o PSP apresenta o
// certificado dele e o nosso servidor confere. O Railway termina o TLS na
// borda e não repassa certificado de cliente, então oferecemos três camadas,
// combináveis, configuradas por variável de ambiente:
//
// 1) Segredo por PSP (obrigatório): PIX_WEBHOOK_SECRET (cai para WEBHOOK_TOKEN
//    se não existir, para não quebrar quem já configurou). Vem em `?hmac=`
//    (o nome que a Efí recomenda para o modo skip-mTLS), `?token=` (legado) ou
//    no header `x-webhook-secret`. Comparação em tempo constante.
//    Efí: https://dev.efipay.com.br/docs/api-pix/webhooks (skip-mTLS + hmac + IP)
// 2) Lista de IPs do PSP (opcional): PIX_WEBHOOK_IPS="ip1,ip2". A Efí publica o
//    IP que usa hoje na página acima; os bancos informam o deles no portal.
// 3) mTLS na borda (opcional, recomendado com Inter/Sicoob/BB, que só chamam
//    com mTLS): um proxy (nginx/Cloudflare) valida o certificado do PSP e
//    repassa `x-client-cert-verified: SUCCESS`, `x-client-cert-fingerprint` e
//    `x-mtls-proxy-secret` (= PIX_WEBHOOK_PROXY_SECRET, para o header não ser
//    forjável de fora). Ativa com PIX_WEBHOOK_MTLS_PROXY=1; as impressões
//    digitais aceitas ficam em PIX_WEBHOOK_CERT_FINGERPRINTS (sha256, hex).
//
// Além disso, a rota reconsulta cada Pix no PSP (GET /pix/{e2eid}) antes de dar
// baixa, quando o PSP está configurado: o corpo do webhook nunca é a fonte
// da verdade do valor.

import crypto from "node:crypto";

export type ResultadoAuthPix =
  | { ok: true; metodos: string[] }
  | { ok: false; status: number; motivo: string };

/** Igualdade em tempo constante, sem vazar o tamanho do segredo. */
export function iguaisTempoConstante(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a, "utf8").digest();
  const hb = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(ha, hb) && a.length === b.length;
}

export function ipDaRequisicao(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    // Último endereço: o que o nosso proxy acrescenta (os da frente podem ser inventados).
    const partes = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (partes.length) return partes[partes.length - 1]!;
  }
  return headers.get("x-real-ip");
}

const lista = (v?: string) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/:/g, ""))
    .filter(Boolean);

export function autenticarWebhookPix(
  req: { query: URLSearchParams; headers: Headers },
  env: NodeJS.ProcessEnv = process.env,
): ResultadoAuthPix {
  const segredo = env.PIX_WEBHOOK_SECRET || env.WEBHOOK_TOKEN;
  if (!segredo) return { ok: false, status: 503, motivo: "webhook Pix sem segredo configurado" };

  const metodos: string[] = [];
  const recebido =
    req.query.get("hmac") ?? req.query.get("token") ?? req.headers.get("x-webhook-secret") ?? "";
  if (!recebido || !iguaisTempoConstante(recebido, segredo)) {
    return { ok: false, status: 401, motivo: "não autorizado" };
  }
  metodos.push("segredo");

  const ips = lista(env.PIX_WEBHOOK_IPS);
  if (ips.length > 0) {
    const ip = (ipDaRequisicao(req.headers) ?? "").toLowerCase().replace(/:/g, "");
    // IPv4 mapeado em IPv6 (::ffff:1.2.3.4) vira "ffff1.2.3.4" sem os ":".
    const ipNormal = ip.replace(/^ffff/, "");
    if (!ips.includes(ipNormal)) return { ok: false, status: 403, motivo: "origem não permitida" };
    metodos.push("ip");
  }

  if (env.PIX_WEBHOOK_MTLS_PROXY === "1") {
    const segredoProxy = env.PIX_WEBHOOK_PROXY_SECRET;
    const veioDoProxy =
      !!segredoProxy &&
      iguaisTempoConstante(req.headers.get("x-mtls-proxy-secret") ?? "", segredoProxy);
    const verificado = (req.headers.get("x-client-cert-verified") ?? "").toUpperCase() === "SUCCESS";
    if (!veioDoProxy || !verificado) {
      return { ok: false, status: 401, motivo: "certificado do PSP não verificado" };
    }
    const digitais = lista(env.PIX_WEBHOOK_CERT_FINGERPRINTS);
    if (digitais.length > 0) {
      const fp = (req.headers.get("x-client-cert-fingerprint") ?? "").toLowerCase().replace(/:/g, "");
      if (!digitais.some((d) => iguaisTempoConstante(d, fp))) {
        return { ok: false, status: 401, motivo: "certificado do PSP não reconhecido" };
      }
    }
    metodos.push("mtls");
  }

  return { ok: true, metodos };
}
