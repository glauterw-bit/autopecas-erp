import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Gatilho da Focus: token no cabeçalho, idempotência e reconsulta (não confia no corpo).

const db = vi.hoisted(() => ({
  eventoWebhook: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  notaFiscal: { findFirst: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
const sinc = vi.hoisted(() => ({ sincronizarNota: vi.fn() }));
vi.mock("@/lib/nfe/sincronizar", () => sinc);

import { POST } from "./route";
import { autenticarWebhookFocus } from "@/lib/nfe/webhook-focus";

const TOKEN = "segredo-do-gatilho-focus-123456";
const corpo = { ref: "venda-v1", status: "autorizado", cnpj_emitente: "12.345.678/0001-95", chave_nfe: "x" };

function chamar(headers: Record<string, string>, body: unknown = corpo) {
  return POST(new NextRequest("https://erp.exemplo.com.br/api/webhooks/focus-nfe", { method: "POST", body: JSON.stringify(body), headers }));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FOCUS_WEBHOOK_TOKEN = TOKEN;
  delete process.env.FOCUS_WEBHOOK_HEADER;
  db.eventoWebhook.create.mockResolvedValue({});
  db.notaFiscal.findFirst.mockResolvedValue({ id: "nf1", empresaId: "A" });
  sinc.sincronizarNota.mockResolvedValue({ notaId: "nf1", status: "AUTORIZADA", mudou: true, mensagem: null });
});

describe("webhook Focus NFe", () => {
  it("sem token configurado: 503; token errado ou ausente: 401; nada processado", async () => {
    delete process.env.FOCUS_WEBHOOK_TOKEN;
    expect((await chamar({ authorization: TOKEN })).status).toBe(503);
    process.env.FOCUS_WEBHOOK_TOKEN = TOKEN;
    expect((await chamar({ authorization: "errado" })).status).toBe(401);
    expect((await chamar({})).status).toBe(401);
    expect(db.eventoWebhook.create).not.toHaveBeenCalled();
    expect(sinc.sincronizarNota).not.toHaveBeenCalled();
  });

  it("token certo (puro ou Bearer, cabeçalho configurável)", () => {
    const h = (o: Record<string, string>) => new Headers(o);
    expect(autenticarWebhookFocus(h({ authorization: `Bearer ${TOKEN}` }), { FOCUS_WEBHOOK_TOKEN: TOKEN }).ok).toBe(true);
    expect(autenticarWebhookFocus(h({ "x-focus-token": TOKEN }), { FOCUS_WEBHOOK_TOKEN: TOKEN, FOCUS_WEBHOOK_HEADER: "X-Focus-Token" }).ok).toBe(true);
    expect(autenticarWebhookFocus(h({ authorization: TOKEN }), { FOCUS_WEBHOOK_TOKEN: TOKEN, FOCUS_WEBHOOK_HEADER: "X-Focus-Token" }).ok).toBe(false);
  });

  it("processa: acha a nota pelo ref + CNPJ e reconsulta a Focus", async () => {
    const r = await chamar({ authorization: TOKEN });
    expect(r.status).toBe(200);
    expect(db.notaFiscal.findFirst.mock.calls[0][0].where).toEqual({ refProvedor: "venda-v1", empresa: { cnpj: "12345678000195" } });
    expect(sinc.sincronizarNota).toHaveBeenCalledWith("nf1", { empresaId: "A" });
    expect(db.eventoWebhook.create.mock.calls[0][0].data).toMatchObject({ origem: "FOCUS_NFE", idExterno: "venda-v1:autorizado" });
  });

  it("reentrega do mesmo evento já processado: 200 sem processar de novo", async () => {
    db.eventoWebhook.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    db.eventoWebhook.findUnique.mockResolvedValue({ status: "PROCESSADO" });
    const r = await chamar({ authorization: TOKEN });
    expect(await r.json()).toEqual({ ok: true, duplicado: true });
    expect(sinc.sincronizarNota).not.toHaveBeenCalled();
  });

  it("nota desconhecida: 200 ignorado", async () => {
    db.notaFiscal.findFirst.mockResolvedValue(null);
    expect(await (await chamar({ authorization: TOKEN })).json()).toEqual({ ok: true, ignorado: true });
    expect(sinc.sincronizarNota).not.toHaveBeenCalled();
  });
});
