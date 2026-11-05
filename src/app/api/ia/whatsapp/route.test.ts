import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const eventos: Array<Record<string, unknown>> = [];
  const prisma = {
    eventoWebhook: {
      findUnique: async ({ where }: { where: { origem_idExterno: { origem: string; idExterno: string } } }) =>
        eventos.find((e) => e.origem === where.origem_idExterno.origem && e.idExterno === where.origem_idExterno.idExterno) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const e = { id: `ev${eventos.length + 1}`, ...data };
        eventos.push(e);
        return e;
      },
    },
    marketplaceConta: { findFirst: async () => ({ id: "conta1", empresaId: "emp1" }) },
  };
  return { eventos, prisma, processar: vi.fn(async () => "respondido") };
});
vi.mock("@/lib/db", () => ({ prisma: h.prisma }));
vi.mock("@/lib/ai/whatsapp-empresa", () => ({
  empresaDoNumeroWhatsapp: async (id?: string) => (id === "PHONE1" ? "emp1" : null),
  mascarar: (v?: string) => `***${v?.slice(-4)}`,
}));
// Sem tocar na IA nem na Meta: só o processamento é trocado; o registro é o real.
vi.mock("@/lib/marketplaces/whatsapp-inbound", async (orig) => ({
  ...(await orig<typeof import("@/lib/marketplaces/whatsapp-inbound")>()),
  processarMensagemWhatsapp: h.processar,
}));

import { GET, POST } from "./route";

const SECRET = "app-secret-de-teste";
function corpo(msgs: Array<Record<string, unknown>>, phone = "PHONE1") {
  return JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: phone }, messages: msgs } }] }] });
}
function post(bruto: string, assinar = true) {
  const sig = "sha256=" + crypto.createHmac("sha256", SECRET).update(bruto).digest("hex");
  return POST(new NextRequest("https://erp.exemplo.com.br/api/ia/whatsapp", {
    method: "POST", body: bruto, headers: assinar ? { "x-hub-signature-256": sig } : {},
  }));
}

beforeEach(() => {
  h.eventos.length = 0;
  h.processar.mockClear();
  process.env.META_APP_SECRET = SECRET;
  process.env.WHATSAPP_VERIFY_TOKEN = "verify-123";
  delete process.env.REDIS_URL;
});

describe("webhook do WhatsApp", () => {
  it("responde 200 e agenda a IA uma vez; reentrega do mesmo message.id não repete", async () => {
    const b = corpo([{ id: "wamid.AAA", from: "5511999990000", text: { body: "tem pastilha de freio?" } }]);
    expect((await post(b)).status).toBe(200);
    expect((await post(b)).status).toBe(200); // a Meta reenviou
    await new Promise((r) => setTimeout(r, 10));
    expect(h.eventos).toHaveLength(1);
    expect(h.eventos[0]).toMatchObject({ origem: "WHATSAPP", idExterno: "wamid.AAA", empresaId: "emp1", status: "PENDENTE" });
    expect(h.processar).toHaveBeenCalledTimes(1);
  });

  it("assinatura inválida: 401 e nada gravado", async () => {
    const r = await post(corpo([{ id: "wamid.B", from: "1", text: { body: "oi" } }]), false);
    expect(r.status).toBe(401);
    expect(h.eventos).toHaveLength(0);
  });

  it("número sem empresa: 200, nada gravado", async () => {
    const r = await post(corpo([{ id: "wamid.C", from: "1", text: { body: "oi" } }], "OUTRO"));
    expect(r.status).toBe(200);
    expect(h.eventos).toHaveLength(0);
  });

  it("verify token do GET: confere em tempo constante, rejeita errado e ausente", async () => {
    const url = (t: string) => new NextRequest(`https://x.com/api/ia/whatsapp?hub.mode=subscribe&hub.verify_token=${t}&hub.challenge=42`);
    expect(await (await GET(url("verify-123"))).text()).toBe("42");
    expect((await GET(url("errado"))).status).toBe(403);
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    expect((await GET(url("undefined"))).status).toBe(403);
  });
});
