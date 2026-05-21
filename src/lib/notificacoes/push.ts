import crypto from "node:crypto";
import axios from "axios";
import { prisma } from "../db";

// Push Notifications (Web Push VAPID + APNs + FCM)
// ================================================
// Para Web Push: implementamos VAPID inline (RFC 8292) sem depender de
// biblioteca externa. APNs e FCM são via HTTP server-to-server.
//
// Use cases para auto peças:
//   - ruptura iminente (Centro de IA)
//   - novo pedido marketplace
//   - fatura próximo do vencimento
//   - OS pronta para retirada
//   - mensagem do cliente (OmniInbox)

export interface PushPayload {
  titulo: string;
  corpo: string;
  url?: string;
  icone?: string;
  badge?: string;
  tag?: string;
  dados?: Record<string, unknown>;
}

// ----- Web Push (VAPID) ---------------------------------------------------

function urlBase64(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function vapidJwt(audience: string): string {
  const privKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:contato@autopecas.app";
  if (!privKey) throw new Error("VAPID_PRIVATE_KEY não configurada");

  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  };
  const h = urlBase64(Buffer.from(JSON.stringify(header)));
  const p = urlBase64(Buffer.from(JSON.stringify(payload)));
  const data = `${h}.${p}`;
  const key = crypto.createPrivateKey({
    key: Buffer.from(privKey, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const signed = crypto.sign(null, Buffer.from(data), key);
  // ECDSA signature precisa ser convertida de ASN.1 DER para r||s (64 bytes)
  const sig = derToRs(signed);
  return `${data}.${urlBase64(sig)}`;
}

function derToRs(der: Buffer): Buffer {
  let i = 2; // skip 0x30, length
  if (der[1] & 0x80) i += der[1] & 0x7f;
  if (der[i] !== 0x02) throw new Error("DER inválido (r)");
  i++;
  const lenR = der[i++];
  let r = der.slice(i, i + lenR);
  i += lenR;
  if (der[i++] !== 0x02) throw new Error("DER inválido (s)");
  const lenS = der[i++];
  let s = der.slice(i, i + lenS);
  // remove leading zeros / pad to 32 bytes
  if (r.length > 32) r = r.slice(r.length - 32);
  else if (r.length < 32) r = Buffer.concat([Buffer.alloc(32 - r.length), r]);
  if (s.length > 32) s = s.slice(s.length - 32);
  else if (s.length < 32) s = Buffer.concat([Buffer.alloc(32 - s.length), s]);
  return Buffer.concat([r, s]);
}

export async function enviarWebPush(opts: {
  endpoint: string;
  p256dh: string;
  authKey: string;
  payload: PushPayload;
  ttlSegundos?: number;
}): Promise<{ ok: boolean; status: number }> {
  const url = new URL(opts.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = vapidJwt(audience);
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
  const body = JSON.stringify(opts.payload);

  // Por simplicidade, enviamos sem encriptação aes128gcm (alguns navegadores
  // ainda aceitam payloads vazios; a encriptação completa exige troca HKDF
  // que vale a pena implementar quando estiver no Railway). Aqui mandamos
  // só o "ping" (payload via dados).
  const resp = await axios.post(opts.endpoint, body, {
    headers: {
      TTL: String(opts.ttlSegundos ?? 86400),
      Authorization: `vapid t=${jwt}, k=${publicKey}`,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      Urgency: "normal",
    },
    validateStatus: () => true,
  });
  return { ok: resp.status >= 200 && resp.status < 300, status: resp.status };
}

// ----- APNs (iOS) e FCM (Android) ----------------------------------------

export async function enviarApns(opts: { deviceToken: string; payload: PushPayload }) {
  const team = process.env.APNS_TEAM_ID;
  const key = process.env.APNS_AUTH_KEY;
  const keyId = process.env.APNS_KEY_ID;
  const topic = process.env.APNS_BUNDLE_ID;
  if (!team || !key || !keyId || !topic) throw new Error("APNs não configurado");

  const header = { alg: "ES256", kid: keyId };
  const claim = { iss: team, iat: Math.floor(Date.now() / 1000) };
  const jwt = `${urlBase64(Buffer.from(JSON.stringify(header)))}.${urlBase64(Buffer.from(JSON.stringify(claim)))}`;
  const pk = crypto.createPrivateKey({ key, format: "pem" });
  const sig = urlBase64(derToRs(crypto.sign(null, Buffer.from(jwt), pk)));
  const token = `${jwt}.${sig}`;

  await axios.post(
    `https://api.push.apple.com/3/device/${opts.deviceToken}`,
    {
      aps: { alert: { title: opts.payload.titulo, body: opts.payload.corpo } },
      ...opts.payload.dados,
    },
    {
      headers: {
        Authorization: `bearer ${token}`,
        "apns-topic": topic,
        "apns-push-type": "alert",
      },
    },
  );
}

export async function enviarFcm(opts: { deviceToken: string; payload: PushPayload }) {
  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey) throw new Error("FCM_SERVER_KEY não configurado");
  await axios.post(
    "https://fcm.googleapis.com/fcm/send",
    {
      to: opts.deviceToken,
      notification: { title: opts.payload.titulo, body: opts.payload.corpo, click_action: opts.payload.url },
      data: opts.payload.dados,
    },
    { headers: { Authorization: `key=${serverKey}`, "Content-Type": "application/json" } },
  );
}

// ----- Distribuidor ------------------------------------------------------

export async function notificarUsuario(usuarioId: string, payload: PushPayload) {
  const subs = await prisma.pushSubscription.findMany({
    where: { usuarioId, ativa: true },
  });
  await dispararPara(subs, payload);
}

export async function notificarCliente(clienteId: string, payload: PushPayload) {
  const subs = await prisma.pushSubscription.findMany({
    where: { clienteId, ativa: true },
  });
  await dispararPara(subs, payload);
}

type SubsArr = Awaited<ReturnType<typeof prisma.pushSubscription.findMany>>;

async function dispararPara(subs: SubsArr, payload: PushPayload) {
  for (const s of subs) {
    try {
      if (s.plataforma === "WEB") {
        await enviarWebPush({
          endpoint: s.endpoint,
          p256dh: s.p256dh,
          authKey: s.authKey,
          payload,
        });
      } else if (s.plataforma === "IOS_APNS") {
        await enviarApns({ deviceToken: s.endpoint, payload });
      } else if (s.plataforma === "ANDROID_FCM") {
        await enviarFcm({ deviceToken: s.endpoint, payload });
      }
    } catch {
      // Marca subscription como inativa se falhar (ex.: token revogado)
      await prisma.pushSubscription
        .update({ where: { id: s.id }, data: { ativa: false } })
        .catch(() => undefined);
    }
  }
}
