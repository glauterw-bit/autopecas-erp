import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Campos fiscais do produto: só FINANCEIRO ou acima, com LogAuditoria antes/depois.

const estado = vi.hoisted(() => ({ perfil: "ESTOQUISTA" }));
vi.mock("@/lib/auth/config", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/config")>()),
  usuarioDaSessao: async () => ({ id: "u1", nome: "U", email: "u@x", perfil: estado.perfil, ativo: true, empresaId: "A", permissoes: [] }),
}));
const db = vi.hoisted(() => {
  const tx = { produto: { update: vi.fn() }, logAuditoria: { create: vi.fn() } };
  return {
    tx,
    prisma: {
      produto: { findFirst: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
vi.mock("@/lib/db", () => ({ prisma: db.prisma }));

import { PATCH } from "./route";

const ATUAL = {
  id: "p1", nome: "Filtro", codigoBarras: null, codigoFabricante: null, codigoOem: null, ncm: "84212300", localizacao: null,
  cest: null, cstIcms: "500", cfopVendaInterna: "5405", cfopVendaInterestadual: "6102", origemFiscal: 0,
  monofasicoPisCofins: false, cstPis: null, cstCofins: null, cstIbsCbs: null, cClassTrib: null,
};
const ctx = { params: Promise.resolve({ id: "p1" }) };
const chamar = (body: unknown) =>
  PATCH(new NextRequest("https://erp.exemplo.com.br/api/produtos/p1", { method: "PATCH", body: JSON.stringify(body) }), ctx);

beforeEach(() => {
  vi.clearAllMocks();
  db.prisma.produto.findFirst.mockResolvedValue(ATUAL);
});

describe("PATCH /api/produtos/[id] — campos fiscais", () => {
  it("ESTOQUISTA não altera NCM (403) e nada é gravado", async () => {
    estado.perfil = "ESTOQUISTA";
    const r = await chamar({ ncm: "8708.30.90" });
    expect(r.status).toBe(403);
    expect((await r.json()).erro).toContain("ncm");
    expect(db.tx.produto.update).not.toHaveBeenCalled();
  });

  it("ESTOQUISTA também não altera CEST, CST, CFOP, origem, monofásico, IBS/CBS", async () => {
    estado.perfil = "ESTOQUISTA";
    for (const body of [{ cest: "0100100" }, { cstIcms: "102" }, { cfopVendaInterna: "5102" }, { origemFiscal: 1 },
      { monofasicoPisCofins: true }, { cstIbsCbs: "000" }, { cClassTrib: "000001" }]) {
      expect((await chamar(body)).status).toBe(403);
    }
  });

  it("ESTOQUISTA ainda corrige localização (campo não fiscal)", async () => {
    estado.perfil = "ESTOQUISTA";
    const r = await chamar({ localizacao: "A-01" });
    expect(r.status).toBe(200);
    expect(db.tx.logAuditoria.create.mock.calls[0][0].data.acao).toBe("CADASTRO_CORRIGIDO");
  });

  it("FINANCEIRO altera NCM/CEST/CST/CFOP com auditoria antes e depois", async () => {
    estado.perfil = "FINANCEIRO";
    const r = await chamar({ ncm: "8421.23.00", cest: "01.010.00", cstIcms: "102", cfopVendaInterna: "5102" });
    expect(r.status).toBe(200);
    expect(db.tx.produto.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { cest: "0101000", cstIcms: "102", cfopVendaInterna: "5102" } });
    expect(db.tx.logAuditoria.create.mock.calls[0][0].data).toMatchObject({
      usuarioId: "u1",
      acao: "CADASTRO_FISCAL_ALTERADO",
      entidade: "Produto",
      entidadeId: "p1",
      dadosAntes: { cest: null, cstIcms: "500", cfopVendaInterna: "5405" },
      dadosDepois: { cest: "0101000", cstIcms: "102", cfopVendaInterna: "5102" },
    });
  });
});
