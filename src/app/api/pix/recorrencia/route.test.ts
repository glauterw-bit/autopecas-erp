import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const recs = [
    { id: "REC-A", empresaId: "empresa-A", status: "ATIVA" },
    { id: "REC-B", empresaId: "empresa-B", status: "ATIVA" },
  ];
  return {
    recs,
    psp: {
      pausarAssinatura: vi.fn(async (id: string) => ({ idRec: id, status: "PAUSADO" })),
      retomarAssinatura: vi.fn(async () => ({})),
      cancelarAssinatura: vi.fn(async () => ({})),
      gerarCobrancaImediata: vi.fn(async () => ({})),
      criarAssinatura: vi.fn(async () => ({})),
    },
    prisma: {
      pixRecorrencia: {
        findFirst: async ({ where }: { where: { id: string; empresaId: string } }) =>
          recs.find((r) => r.id === where.id && r.empresaId === where.empresaId) ?? null,
        findUnique: async ({ where }: { where: { id: string } }) => recs.find((r) => r.id === where.id) ?? null,
        updateMany: async ({ where, data }: { where: { id: string; empresaId: string }; data: { status: string } }) => {
          const r = recs.find((x) => x.id === where.id && x.empresaId === where.empresaId);
          if (r) r.status = data.status;
          return { count: r ? 1 : 0 };
        },
      },
      cliente: { findFirst: async () => ({ id: "cli" }) },
    },
  };
});
vi.mock("@/lib/db", () => ({ prisma: m.prisma }));
vi.mock("@/lib/pagamentos/pix-recorrente", () => m.psp);
vi.mock("@/lib/auth/config", () => ({
  usuarioDaSessao: async () => ({
    id: "u1",
    nome: "Fin A",
    email: "a@a",
    perfil: "FINANCEIRO",
    ativo: true,
    empresaId: "empresa-A",
    permissoes: [],
  }),
  podePerfil: () => true,
}));

import { POST } from "./route";

const chamar = (corpo: unknown) =>
  POST(new NextRequest("https://erp/api/pix/recorrencia", { method: "POST", body: JSON.stringify(corpo) }), {});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Pix Automático: isolamento entre empresas", () => {
  it("empresa A não pausa, cancela nem cobra a recorrência da empresa B", async () => {
    for (const corpo of [
      { acao: "pausar", idRec: "REC-B" },
      { acao: "cancelar", idRec: "REC-B", motivo: "x" },
      { acao: "cobrar", idRec: "REC-B" },
    ]) {
      const r = await chamar(corpo);
      expect(r.status).toBe(404);
    }
    expect(m.psp.pausarAssinatura).not.toHaveBeenCalled();
    expect(m.psp.cancelarAssinatura).not.toHaveBeenCalled();
    expect(m.psp.gerarCobrancaImediata).not.toHaveBeenCalled();
    expect(m.recs.find((r) => r.id === "REC-B")!.status).toBe("ATIVA");
  });

  it("empresa A pausa a própria recorrência", async () => {
    const r = await chamar({ acao: "pausar", idRec: "REC-A" });
    expect(r.status).toBe(200);
    expect(m.psp.pausarAssinatura).toHaveBeenCalledWith("REC-A");
    expect(m.recs.find((x) => x.id === "REC-A")!.status).toBe("PAUSADA");
  });

  it("não deixa criar com um id que já é de outra empresa", async () => {
    const r = await chamar({
      acao: "criar",
      id: "REC-B",
      clienteId: "cli",
      descricao: "Plano frota",
      valor: 100,
      periodicidade: "MENSAL",
      dataInicio: "2026-12-01",
      diaCobranca: 5,
    });
    expect(r.status).toBe(409);
    expect(m.psp.criarAssinatura).not.toHaveBeenCalled();
  });
});
