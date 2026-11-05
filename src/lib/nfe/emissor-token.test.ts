import { beforeEach, describe, expect, it, vi } from "vitest";

// Sem token da Focus a emissão bloqueia ANTES de gravar qualquer nota e sem chamar a Focus.

const db = vi.hoisted(() => ({
  venda: { findFirstOrThrow: vi.fn(), findFirst: vi.fn() },
  notaFiscal: { create: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("../db", () => ({ prisma: db }));
const http = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock("axios", () => ({ default: http }));

import { emitirNotaFiscal, enviarFocus } from "./emissor";
import { emitirNotaDevolucao } from "./devolucao";

const EMPRESA = { cnpj: "12345678000195", inscEstadual: "1", uf: "SP", regimeTributario: "SIMPLES_NACIONAL", configuracoes: null };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FOCUS_NFE_TOKEN;
  delete process.env.FOCUS_NFE_TOKEN_12345678000195;
});

describe("emissão sem token da Focus", () => {
  it("enviarFocus: 422 em português, sem chamar a Focus", async () => {
    await expect(enviarFocus({ empresa: EMPRESA, modelo: "55", ref: "r", payload: {} })).rejects.toMatchObject({
      status: 422,
      message: "Emissão de nota não configurada: falta o token da Focus NFe desta empresa",
    });
    expect(http.post).not.toHaveBeenCalled();
  });

  it("venda: bloqueia antes de montar/gravar; nenhuma NotaFiscal criada", async () => {
    db.venda.findFirstOrThrow.mockResolvedValue({
      id: "v1", empresaId: "A", status: "PAGA", notaFiscalId: null, origem: "BALCAO",
      empresa: EMPRESA, cliente: null, itens: [], pagamentos: [],
    });
    await expect(emitirNotaFiscal("v1", "A")).rejects.toMatchObject({ status: 422, message: expect.stringContaining("falta o token") });
    expect(db.notaFiscal.create).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });

  it("devolução: bloqueia antes de reservar; nada gravado", async () => {
    db.venda.findFirst.mockResolvedValue({
      id: "v1", empresaId: "A", empresa: EMPRESA, cliente: { nome: "C" }, itens: [],
      notaFiscal: { status: "AUTORIZADA", chaveAcesso: "3526111234567800019555001000000123100000123" + "4" },
    });
    await expect(
      emitirNotaDevolucao({ empresaId: "A", vendaId: "v1", itens: [{ itemVendaId: "iv1", quantidade: 1 }] }),
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining("falta o token") });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.notaFiscal.create).not.toHaveBeenCalled();
  });
});
