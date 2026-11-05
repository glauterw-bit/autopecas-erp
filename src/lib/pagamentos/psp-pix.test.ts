import axios from "axios";
import { describe, expect, it } from "vitest";
import { configPspDoAmbiente, erroPspSeguro, montarRequisicaoToken, PspPixClient } from "./psp-pix";

const base = { baseUrl: "https://pix.exemplo/v2", clientId: "id", clientSecret: "segredo" };

describe("PSP Pix com mTLS", () => {
  it("recusa criar cliente sem certificado (BCB exige mTLS)", () => {
    expect(() => new PspPixClient(base)).toThrow(/mTLS/);
  });
  it("usa o certificado num https.Agent", () => {
    const c = new PspPixClient({ ...base, certificado: { pfx: Buffer.from("pfx-falso"), passphrase: "x" } });
    expect(c.http.defaults.httpsAgent).toBeDefined();
    expect(c.http.defaults.httpsAgent.options.pfx).toBeInstanceOf(Buffer);
    expect(c.http.defaults.httpsAgent.options.minVersion).toBe("TLSv1.2");
  });
  it("token por PSP: Efí em JSON com Basic; Inter em form sem Basic", () => {
    const efi = montarRequisicaoToken({ ...base, provedor: "efi" });
    expect(efi.url).toBe("https://pix.exemplo/v2/oauth/token");
    expect(JSON.parse(efi.corpo)).toEqual({ grant_type: "client_credentials" });
    expect(efi.headers.Authorization).toMatch(/^Basic /);
    const inter = montarRequisicaoToken({ ...base, provedor: "inter" });
    expect(inter.url).toContain("bancointer");
    expect(inter.headers.Authorization).toBeUndefined();
    expect(inter.corpo).toContain("client_secret=segredo");
  });
  it("lê o certificado em base64 do ambiente", () => {
    const cfg = configPspDoAmbiente({
      PSP_PIX_BASE_URL: "https://x",
      PSP_PIX_CLIENT_ID: "a",
      PSP_PIX_CLIENT_SECRET: "b",
      PSP_PIX_PROVEDOR: "EFI",
      PSP_PIX_CERT_P12_BASE64: Buffer.from("abc").toString("base64"),
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg?.provedor).toBe("efi");
    expect(cfg?.certificado?.pfx?.toString()).toBe("abc");
  });
  it("erro do PSP não carrega o Authorization nem o segredo", () => {
    const e = new axios.AxiosError("falhou", "ERR", { headers: { Authorization: "Basic c2VncmVkbw==" } } as never, null, {
      status: 401,
      data: { error: "invalid_client" },
    } as never);
    const seguro = erroPspSeguro(e, "token");
    expect(seguro.message).toBe("PSP Pix (token) respondeu 401: invalid_client");
    expect(JSON.stringify(seguro)).not.toContain("c2VncmVkbw");
  });
});
