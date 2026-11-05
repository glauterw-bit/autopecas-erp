import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  conta: null as null | { contaExternaId: string; accessToken: string | null },
  post: vi.fn(async () => ({})),
}));
vi.mock("../db", () => ({ prisma: { marketplaceConta: { findFirst: async () => h.conta } } }));
vi.mock("axios", () => ({ default: { post: h.post } }));

import { enviarTexto } from "./whatsapp";

beforeEach(() => {
  h.post.mockClear();
  h.conta = null;
  process.env.WHATSAPP_PHONE_NUMBER_ID = "ENV_PHONE";
  process.env.WHATSAPP_TOKEN = "tok-env";
});

describe("enviarTexto", () => {
  it("usa o phone_number_id e o token da conta da empresa quando existe", async () => {
    h.conta = { contaExternaId: "CONTA_PHONE", accessToken: "tok-conta" };
    await enviarTexto({ para: "5511", texto: "oi", empresaId: "emp1", phoneNumberId: "CONTA_PHONE" });
    const [url, , cfg] = h.post.mock.calls[0] as unknown as [string, unknown, { headers: { Authorization: string } }];
    expect(url).toContain("/CONTA_PHONE/messages");
    expect(cfg.headers.Authorization).toBe("Bearer tok-conta");
  });
  it("sem conta da empresa, cai no env (instalação de número único)", async () => {
    await enviarTexto({ para: "5511", texto: "oi", empresaId: "emp1" });
    expect((h.post.mock.calls[0] as unknown as [string])[0]).toContain("/ENV_PHONE/messages");
  });
  it("conta sem token próprio usa o token do env, mas o número da conta", async () => {
    h.conta = { contaExternaId: "CONTA_PHONE", accessToken: null };
    await enviarTexto({ para: "5511", texto: "oi", empresaId: "emp1" });
    const [url, , cfg] = h.post.mock.calls[0] as unknown as [string, unknown, { headers: { Authorization: string } }];
    expect(url).toContain("/CONTA_PHONE/");
    expect(cfg.headers.Authorization).toBe("Bearer tok-env");
  });
});
