import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Banco falso em memória: só o que a baixa do Pix usa.
const db = vi.hoisted(() => {
  const estado = {
    movimentos: [] as Array<{ id: string; documento: string; valor: number; empresaId: string }>,
    contas: [] as Array<Record<string, unknown>>,
    eventos: new Map<string, { status: string; empresaId: string | null }>(),
  };
  const tx = {
    $executeRaw: async () => 0,
    movimentoCaixa: {
      findFirst: async ({ where }: { where: { documento: { in: string[] } } }) =>
        estado.movimentos.find((m) => where.documento.in.includes(m.documento)) ?? null,
      create: async ({ data }: { data: { documento: string; valor: number; empresaId: string } }) => {
        const m = { id: `m${estado.movimentos.length + 1}`, ...data };
        estado.movimentos.push(m);
        return m;
      },
    },
    contaReceber: {
      findFirst: async ({ where }: { where: { documento: string } }) =>
        (estado.contas.find((c) => c.documento === where.documento && c.status !== "PAGO") as never) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { valorRecebido: { increment: number }; status: string } }) => {
        const c = estado.contas.find((x) => x.id === where.id)!;
        c.valorRecebido = (c.valorRecebido as number) + data.valorRecebido.increment;
        c.status = data.status;
        return c;
      },
    },
    pagamentoVenda: { findFirst: async () => null },
    cliente: { updateMany: async () => ({ count: 1 }) },
    insightIA: { create: async () => ({}) },
    eventoWebhook: {
      upsert: async ({ create }: { create: { idExterno: string; status: string; empresaId: string | null } }) => {
        estado.eventos.set(create.idExterno, { status: create.status, empresaId: create.empresaId });
        return {};
      },
    },
  };
  return { estado, prisma: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});
vi.mock("@/lib/db", () => ({ prisma: db.prisma }));

import { POST } from "./route";

const TXID = "AP0123456789abcdef012345";
const SEGREDO = "segredo-do-webhook-pix-0123456789";

function chamar(corpo: unknown, query = `?hmac=${SEGREDO}`) {
  return POST(
    new NextRequest(`https://erp.exemplo.com.br/api/webhooks/pix${query}`, {
      method: "POST",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }),
  );
}

beforeEach(() => {
  process.env.PIX_WEBHOOK_SECRET = SEGREDO;
  delete process.env.PSP_PIX_BASE_URL;
  db.estado.movimentos.length = 0;
  db.estado.eventos.clear();
  db.estado.contas.length = 0;
  db.estado.contas.push({
    id: "cr1",
    empresaId: "empresa-A",
    documento: TXID,
    status: "ABERTO",
    valor: 150.5,
    juros: 0,
    multa: 0,
    desconto: 0,
    valorRecebido: 0,
    descricao: "Venda 10",
    formaPagamento: "PIX",
    contaBancariaId: null,
    clienteId: null,
    dataRecebimento: null,
    venda: null,
  });
});

describe("webhook Pix", () => {
  it("recusa sem segredo ou com segredo errado", async () => {
    expect((await chamar({ pix: [] }, "")).status).toBe(401);
    expect((await chamar({ pix: [] }, "?hmac=errado")).status).toBe(401);
  });

  it("dá baixa uma única vez mesmo com reentrega do PSP (idempotência)", async () => {
    const pix = { pix: [{ txid: TXID, valor: "150.50", endToEndId: "E1234567820261104", horario: "2026-11-04T10:00:00Z" }] };
    const r1 = await chamar(pix);
    expect(await r1.json()).toMatchObject({ ok: true, processados: 1 });
    const r2 = await chamar(pix);
    expect(r2.status).toBe(200);
    // Reenvio sem endToEndId também não duplica (documento = txid).
    await chamar({ pix: [{ txid: TXID, valor: "150.50" }] });

    expect(db.estado.movimentos).toHaveLength(1);
    expect(db.estado.movimentos[0]).toMatchObject({ documento: TXID, valor: 150.5, empresaId: "empresa-A" });
    const conta = db.estado.contas[0]!;
    expect(conta.valorRecebido).toBe(150.5);
    expect(conta.status).toBe("PAGO");
    expect(db.estado.eventos.get("E1234567820261104")).toEqual({ status: "PROCESSADO", empresaId: "empresa-A" });
  });

  it("txid desconhecido fica ignorado, sem baixa", async () => {
    const r = await chamar({ pix: [{ txid: "AP" + "f".repeat(22), valor: 10, endToEndId: "E9" }] });
    expect(await r.json()).toEqual({ ignorado: true });
    expect(db.estado.movimentos).toHaveLength(0);
  });
});
