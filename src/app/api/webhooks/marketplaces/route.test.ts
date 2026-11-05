import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const contas = [
    { id: "contaA", empresaId: "empresa-A", plataforma: "MERCADO_LIVRE", contaExternaId: "111", ativa: true },
    { id: "contaB", empresaId: "empresa-B", plataforma: "MERCADO_LIVRE", contaExternaId: "222", ativa: true },
    { id: "shopB", empresaId: "empresa-B", plataforma: "SHOPEE", contaExternaId: "555", ativa: true },
  ];
  const eventos: Array<Record<string, unknown>> = [];
  const prisma = {
    eventoWebhook: {
      findUnique: async ({ where }: { where: { origem_idExterno: { origem: string; idExterno: string } } }) =>
        eventos.find(
          (e) => e.origem === where.origem_idExterno.origem && e.idExterno === where.origem_idExterno.idExterno,
        ) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const e = { id: `ev${eventos.length + 1}`, ...data };
        eventos.push(e);
        return e;
      },
    },
    marketplaceConta: {
      findFirst: async ({ where }: { where: { plataforma: string; contaExternaId: string } }) =>
        contas.find((c) => c.plataforma === where.plataforma && c.contaExternaId === where.contaExternaId && c.ativa) ??
        null,
    },
    empresa: {
      findFirst: async () => {
        throw new Error("não pode cair na primeira empresa do banco");
      },
    },
  };
  return { eventos, prisma };
});
vi.mock("@/lib/db", () => ({ prisma: db.prisma }));

import { assinarShopee } from "@/lib/marketplaces/webhook";
import { POST } from "./route";

const TOKEN = "token-webhook-de-teste-0123456789";
const BASE = "https://erp.exemplo.com.br/api/webhooks/marketplaces";

function ml(corpo: Record<string, unknown>, token = TOKEN) {
  return POST(
    new NextRequest(`${BASE}?token=${token}&plataforma=mercado_livre`, { method: "POST", body: JSON.stringify(corpo) }),
  );
}

beforeEach(() => {
  process.env.WEBHOOK_TOKEN = TOKEN;
  process.env.ML_APP_ID = "4321";
  process.env.SHOPEE_PARTNER_KEY = "pk-teste";
  delete process.env.REDIS_URL;
  delete process.env.APP_URL;
  db.eventos.length = 0;
});

describe("webhook de marketplace: isolamento entre empresas", () => {
  it("evento do vendedor da empresa B fica na empresa B (nunca na primeira empresa)", async () => {
    const r = await ml({ _id: "n1", user_id: 222, application_id: 4321, topic: "orders_v2", resource: "/orders/9" });
    expect(r.status).toBe(200);
    expect(db.eventos).toHaveLength(1);
    expect(db.eventos[0]).toMatchObject({ empresaId: "empresa-B", contaId: "contaB", status: "PENDENTE" });
  });

  it("vendedor desconhecido: ignorado com motivo, sem empresa", async () => {
    await ml({ _id: "n2", user_id: 999, application_id: 4321, topic: "orders_v2", resource: "/orders/1" });
    expect(db.eventos[0]).toMatchObject({ empresaId: null, contaId: null, status: "IGNORADO" });
    expect(String(db.eventos[0]!.erro)).toMatch(/nenhuma conta/);
  });

  it("reentrega do mesmo aviso não duplica (idempotência)", async () => {
    const corpo = { _id: "n3", user_id: 111, application_id: 4321, topic: "orders_v2", resource: "/orders/5" };
    await ml(corpo);
    await ml(corpo);
    expect(db.eventos).toHaveLength(1);
    expect(db.eventos[0]!.empresaId).toBe("empresa-A");
  });

  it("recusa token errado e aplicação do ML que não é a nossa", async () => {
    expect((await ml({ _id: "x" }, "errado")).status).toBe(401);
    expect((await ml({ _id: "y", user_id: 111, application_id: 1 })).status).toBe(401);
    expect(db.eventos).toHaveLength(0);
  });

  it("Shopee: HMAC válido grava na empresa da loja; inválido é recusado", async () => {
    const corpo = JSON.stringify({ shop_id: 555, code: 3, timestamp: 1, data: {} });
    const url = `${BASE}?token=${TOKEN}&plataforma=shopee`;
    const ok = await POST(
      new NextRequest(url, { method: "POST", body: corpo, headers: { authorization: assinarShopee("pk-teste", url, corpo) } }),
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("");
    expect(db.eventos[0]).toMatchObject({ empresaId: "empresa-B", origem: "SHOPEE" });
    const ruim = await POST(new NextRequest(url, { method: "POST", body: corpo, headers: { authorization: "00".repeat(32) } }));
    expect(ruim.status).toBe(401);
  });
});
