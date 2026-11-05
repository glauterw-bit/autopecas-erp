import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Criação de produto: campos fiscais só FINANCEIRO ou acima (igual ao PATCH).

const estado = vi.hoisted(() => ({ perfil: "ESTOQUISTA" }));
vi.mock("@/lib/auth/config", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/config")>()),
  usuarioDaSessao: async () => ({ id: "u1", nome: "U", email: "u@x", perfil: estado.perfil, ativo: true, empresaId: "A", permissoes: [] }),
}));
const db = vi.hoisted(() => {
  const tx = { produto: { create: vi.fn() }, logAuditoria: { create: vi.fn() } };
  return {
    tx,
    prisma: {
      produto: { findFirst: vi.fn() },
      // Plano: sem assinatura cadastrada = sem limite (política não interfere neste teste).
      assinatura: { findUnique: vi.fn(async () => null) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
vi.mock("@/lib/db", () => ({ prisma: db.prisma }));
vi.mock("@/lib/auth/auditoria", () => ({ registrarAuditoria: vi.fn() }));

import { POST } from "./route";

const chamar = (body: unknown) =>
  POST(new NextRequest("https://erp.exemplo.com.br/api/produtos", { method: "POST", body: JSON.stringify(body) }), {});

beforeEach(() => {
  vi.clearAllMocks();
  db.prisma.produto.findFirst.mockResolvedValue(null);
  db.tx.produto.create.mockResolvedValue({ id: "p1", sku: "X", nome: "Filtro" });
});

describe("POST /api/produtos — campos fiscais", () => {
  it("ESTOQUISTA com NCM, CEST ou origem diferente de 0: 403 com mensagem clara e nada gravado", async () => {
    estado.perfil = "ESTOQUISTA";
    for (const extra of [{ ncm: "8421.23.00" }, { cest: "01.010.00" }, { origemFiscal: 1 }, { cstIcms: "102" }]) {
      const r = await chamar({ sku: "X", nome: "Filtro", ...extra });
      expect(r.status).toBe(403);
      expect((await r.json()).erro).toContain("Financeiro");
    }
    expect(db.tx.produto.create).not.toHaveBeenCalled();
  });

  it("ESTOQUISTA sem campos fiscais (ou com vazios e origem padrão 0) cadastra normalmente", async () => {
    estado.perfil = "ESTOQUISTA";
    const r = await chamar({ sku: "X", nome: "Filtro", ncm: "", cest: "", origemFiscal: 0 });
    expect(r.status).toBe(201);
    expect(db.tx.produto.create).toHaveBeenCalledTimes(1);
  });

  it("FINANCEIRO cadastra com NCM", async () => {
    estado.perfil = "FINANCEIRO";
    const r = await chamar({ sku: "X", nome: "Filtro", ncm: "8421.23.00" });
    expect(r.status).toBe(201);
    expect(db.tx.produto.create.mock.calls[0][0].data.ncm).toBe("84212300");
  });
});
