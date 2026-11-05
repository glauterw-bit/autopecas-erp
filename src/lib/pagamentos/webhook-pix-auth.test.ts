import { describe, expect, it } from "vitest";
import { autenticarWebhookPix } from "./webhook-pix-auth";

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
const req = (q: string, h: Record<string, string> = {}) => ({ query: new URLSearchParams(q), headers: new Headers(h) });

describe("autenticação do webhook Pix", () => {
  it("sem segredo configurado recusa com 503", () => {
    expect(autenticarWebhookPix(req("hmac=x"), env({}))).toMatchObject({ ok: false, status: 503 });
  });
  it("aceita ?hmac= (Efí), ?token= (legado) e header", () => {
    const e = env({ PIX_WEBHOOK_SECRET: "s3gr3do" });
    expect(autenticarWebhookPix(req("hmac=s3gr3do&ignorar=/pix"), e).ok).toBe(true);
    expect(autenticarWebhookPix(req("token=s3gr3do"), e).ok).toBe(true);
    expect(autenticarWebhookPix(req("", { "x-webhook-secret": "s3gr3do" }), e).ok).toBe(true);
    expect(autenticarWebhookPix(req("hmac=s3gr3dx"), e)).toMatchObject({ ok: false, status: 401 });
  });
  it("lista de IPs do PSP", () => {
    const e = env({ PIX_WEBHOOK_SECRET: "s", PIX_WEBHOOK_IPS: "34.193.116.226" });
    expect(autenticarWebhookPix(req("hmac=s", { "x-forwarded-for": "34.193.116.226, 10.0.0.1" }), e).ok).toBe(true);
    expect(autenticarWebhookPix(req("hmac=s", { "x-forwarded-for": "1.2.3.4" }), e)).toMatchObject({ status: 403 });
  });
  it("mTLS na borda: exige proxy confiável, verificação e impressão digital", () => {
    const e = env({
      PIX_WEBHOOK_SECRET: "s",
      PIX_WEBHOOK_MTLS_PROXY: "1",
      PIX_WEBHOOK_PROXY_SECRET: "proxy",
      PIX_WEBHOOK_CERT_FINGERPRINTS: "AA:BB:CC",
    });
    const ok = { "x-mtls-proxy-secret": "proxy", "x-client-cert-verified": "SUCCESS", "x-client-cert-fingerprint": "aabbcc" };
    expect(autenticarWebhookPix(req("hmac=s", ok), e)).toEqual({ ok: true, metodos: ["segredo", "mtls"] });
    expect(autenticarWebhookPix(req("hmac=s", { ...ok, "x-mtls-proxy-secret": "forjado" }), e).ok).toBe(false);
    expect(autenticarWebhookPix(req("hmac=s", { ...ok, "x-client-cert-fingerprint": "dd" }), e).ok).toBe(false);
  });
});
