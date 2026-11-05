import { describe, it, expect, vi, beforeEach } from "vitest";

// Isolamento entre empresas no NFS-e e no MDF-e (achado da auditoria):
// uma empresa não pode faturar venda, encerrar ou cancelar documento de outra.

const db = vi.hoisted(() => ({
  empresa: { findUniqueOrThrow: vi.fn() },
  venda: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  notaFiscal: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
}));
vi.mock("../db", () => ({ prisma: db }));
const http = vi.hoisted(() => ({ post: vi.fn(), delete: vi.fn() }));
vi.mock("axios", () => ({ default: http }));

import { cancelarNfse, emitirNfse } from "./nfse";
import { cancelarMdfe, emitirMdfe, encerrarMdfe } from "./mdfe";
import { chaveEhDaEmpresa, configFocus } from "./config-focus";

const EMPRESA_A = { id: "A", cnpj: "11111111000111", inscEstadual: "1", razaoSocial: "Loja A", uf: "SP", configuracoes: null };
const EMPRESA_B_CNPJ = "22222222000122";
const chaveDe = (cnpj: string, mod = "58") => `352611${cnpj}${mod}001000000001100000001` + "9";

beforeEach(() => {
  vi.clearAllMocks();
  db.empresa.findUniqueOrThrow.mockResolvedValue(EMPRESA_A);
  http.post.mockResolvedValue({ status: 200, data: { status: "autorizado" } });
  http.delete.mockResolvedValue({ status: 200, data: {} });
  db.notaFiscal.create.mockResolvedValue({ id: "nf1" });
});

describe("NFS-e: isolamento entre empresas", () => {
  const base = {
    empresaId: "A",
    tomadorCpfCnpj: "12345678909",
    tomadorNome: "Cliente",
    itens: [{ codigoServico: "14.01", descricao: "Troca", quantidade: 1, valorUnitario: 100, aliquotaIss: 2 }],
  };
  it("recusa vendaId de outra empresa e não transmite nada", async () => {
    db.venda.findFirst.mockResolvedValue(null);
    await expect(emitirNfse({ ...base, vendaId: "venda-da-B" })).rejects.toThrow("Venda não encontrada");
    expect(db.venda.findFirst).toHaveBeenCalledWith({ where: { id: "venda-da-B", empresaId: "A" }, select: { id: true } });
    expect(http.post).not.toHaveBeenCalled();
    expect(db.venda.updateMany).not.toHaveBeenCalled();
    expect(db.venda.update).not.toHaveBeenCalled();
  });
  it("marca como faturada só filtrando pela empresa da sessão", async () => {
    db.venda.findFirst.mockResolvedValue({ id: "v1" });
    db.venda.updateMany.mockResolvedValue({ count: 1 });
    await emitirNfse({ ...base, vendaId: "v1" });
    expect(db.venda.updateMany).toHaveBeenCalledWith({
      where: { id: "v1", empresaId: "A" },
      data: { notaFiscalId: "nf1", status: "FATURADA" },
    });
  });
  it("cancelar NFS-e de outra empresa não acha a nota", async () => {
    db.notaFiscal.findFirst.mockResolvedValue(null);
    await expect(cancelarNfse("nf-da-B", "motivo qualquer", "A")).rejects.toThrow("Nota fiscal não encontrada");
    expect(db.notaFiscal.findFirst.mock.calls[0][0].where).toEqual({ id: "nf-da-B", empresaId: "A" });
    expect(http.delete).not.toHaveBeenCalled();
  });
});

describe("MDF-e: isolamento entre empresas (CNPJ dentro da chave)", () => {
  it("não encerra MDF-e de outra empresa", async () => {
    await expect(
      encerrarMdfe({ empresaId: "A", chaveMdfe: chaveDe(EMPRESA_B_CNPJ), ufEncerramento: "SP", cidadeIbge: "3552809" }),
    ).rejects.toThrow("MDF-e não encontrado");
    expect(http.post).not.toHaveBeenCalled();
  });
  it("não cancela MDF-e de outra empresa", async () => {
    await expect(cancelarMdfe(chaveDe(EMPRESA_B_CNPJ), "justificativa com mais de 15", "A")).rejects.toThrow("MDF-e não encontrado");
    expect(http.delete).not.toHaveBeenCalled();
  });
  it("encerra o próprio MDF-e", async () => {
    await encerrarMdfe({ empresaId: "A", chaveMdfe: chaveDe(EMPRESA_A.cnpj), ufEncerramento: "SP", cidadeIbge: "3552809" });
    expect(http.post).toHaveBeenCalledTimes(1);
  });
  it("não emite MDF-e carregando NF-e de outra empresa", async () => {
    await expect(
      emitirMdfe({
        empresaId: "A", ufInicio: "SP", ufFim: "SP",
        veiculo: { placa: "ABC1D23", tara: 2000, tipoRodado: "06", tipoCarroceria: "02", uf: "SP" },
        motorista: { cpf: "12345678909", nome: "Motorista" },
        notasFiscaisChaves: [chaveDe(EMPRESA_A.cnpj, "55"), chaveDe(EMPRESA_B_CNPJ, "55")],
        cidadeCarregamentoIbge: "3552809", cidadeDescarregamentoIbge: "3513009",
        pesoBrutoKg: 100, valorTotalCarga: 1000,
      }),
    ).rejects.toThrow("não é desta empresa");
    expect(http.post).not.toHaveBeenCalled();
  });
});

describe("configuração da Focus por empresa", () => {
  it("homologação por padrão; produção só se empresa E servidor pedirem", () => {
    const e = { cnpj: "11.111.111/0001-11", configuracoes: { fiscal: { focus: { ambiente: "producao", serieNfce: "2" } } } };
    expect(configFocus(e, {}).ambiente).toBe("homologacao");
    expect(configFocus(e, { FOCUS_NFE_AMBIENTE: "producao" }).ambiente).toBe("producao");
    expect(configFocus({ cnpj: "1", configuracoes: null }, { FOCUS_NFE_AMBIENTE: "producao" }).ambiente).toBe("homologacao");
    expect(configFocus(e, {}).serieNfce).toBe("2");
  });
  it("token por CNPJ com reserva global", () => {
    const e = { cnpj: "11111111000111", configuracoes: null };
    expect(configFocus(e, { FOCUS_NFE_TOKEN_11111111000111: "tA", FOCUS_NFE_TOKEN: "g" }).token).toBe("tA");
    expect(configFocus(e, { FOCUS_NFE_TOKEN: "g" }).token).toBe("g");
  });
  it("chaveEhDaEmpresa confere o CNPJ das posições 7 a 20", () => {
    expect(chaveEhDaEmpresa(chaveDe(EMPRESA_A.cnpj), EMPRESA_A.cnpj)).toBe(true);
    expect(chaveEhDaEmpresa(chaveDe(EMPRESA_B_CNPJ), EMPRESA_A.cnpj)).toBe(false);
    expect(chaveEhDaEmpresa("123", EMPRESA_A.cnpj)).toBe(false);
  });
});
