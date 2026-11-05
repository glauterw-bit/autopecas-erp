import { beforeEach, describe, expect, it, vi } from "vitest";

// Consulta da NF-e na Focus (GET /v2/nfe/{ref}) com respostas simuladas:
// autorizado, processando e erro. Formato: https://doc.focusnfe.com.br/reference/consultar_nfe

const db = vi.hoisted(() => {
  const tx = {
    notaFiscal: { updateMany: vi.fn() },
    venda: { findFirst: vi.fn(), update: vi.fn() },
    itemVenda: { updateMany: vi.fn() },
    solicitacaoRMA: { updateMany: vi.fn() },
    logAuditoria: { create: vi.fn() },
    $executeRaw: vi.fn(),
  };
  return {
    tx,
    prisma: {
      notaFiscal: { findFirst: vi.fn(), updateMany: tx.notaFiscal.updateMany, findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
vi.mock("../db", () => ({ prisma: db.prisma }));
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("axios", () => ({ default: http }));

import { interpretarConsulta, sincronizarNota, sincronizarPendentes } from "./sincronizar";

const AGORA = new Date("2026-11-04T15:00:00Z");
const CHAVE = "35261112345678000195550010000001231000001234";
const NOTA_VENDA = {
  id: "nf1",
  empresaId: "A",
  modelo: "NFE_55",
  status: "EMITINDO",
  refProvedor: "venda-v1",
  finalidade: 1,
  numero: -1234,
  devolucaoItens: null,
  mensagemSefaz: null,
  dataEmissao: new Date("2026-11-04T14:50:00Z"),
  empresa: { cnpj: "12345678000195", configuracoes: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FOCUS_NFE_TOKEN = "token-homologacao-teste";
  delete process.env.FOCUS_NFE_AMBIENTE;
  db.prisma.notaFiscal.findFirst.mockResolvedValue(NOTA_VENDA);
  db.tx.notaFiscal.updateMany.mockResolvedValue({ count: 1 });
  db.tx.venda.findFirst.mockResolvedValue({ id: "v1", status: "FATURADA", numero: 10 });
});

describe("interpretarConsulta (resposta da Focus)", () => {
  it("processando, autorizado, erro, denegado, 404 e falha", () => {
    expect(interpretarConsulta(200, { status: "processando_autorizacao" })).toEqual({ tipo: "processando" });
    expect(interpretarConsulta(200, {
      status: "autorizado", status_sefaz: "100", mensagem_sefaz: "Autorizado o uso da NF-e", chave_nfe: CHAVE,
      numero: "123", serie: "1", caminho_xml_nota_fiscal: "/arquivos/x-nfe.xml", caminho_danfe: "/arquivos/x.pdf",
      protocolo_nota_fiscal: { numero_protocolo: "135260000000001" },
    })).toMatchObject({ tipo: "autorizada", chave: CHAVE, numero: 123, serie: "1", protocolo: "135260000000001", mensagem: "100 - Autorizado o uso da NF-e" });
    expect(interpretarConsulta(200, { status: "erro_autorizacao", status_sefaz: "321", mensagem_sefaz: "Rejeicao: NF-e de devolucao nao possui documento referenciado" }))
      .toEqual({ tipo: "recusada", status: "REJEITADA", mensagem: "321 - Rejeicao: NF-e de devolucao nao possui documento referenciado" });
    expect(interpretarConsulta(200, { status: "denegado", status_sefaz: "301", mensagem_sefaz: "Uso Denegado" })).toMatchObject({ tipo: "recusada", status: "DENEGADA" });
    expect(interpretarConsulta(404, { codigo: "nao_encontrado" })).toEqual({ tipo: "nao_encontrada" });
    expect(interpretarConsulta(503, {})).toMatchObject({ tipo: "falha" });
    expect(interpretarConsulta(401, "HTTP Basic: Access denied" as never)).toMatchObject({ tipo: "falha" });
  });
});

describe("sincronizarNota", () => {
  it("autorizado: grava status, chave, número, série, protocolo, XML e DANFE", async () => {
    http.get
      .mockResolvedValueOnce({
        status: 200,
        data: {
          status: "autorizado", status_sefaz: "100", mensagem_sefaz: "Autorizado o uso da NF-e", chave_nfe: CHAVE,
          numero: "123", serie: "1", caminho_xml_nota_fiscal: "/arquivos/x-nfe.xml", caminho_danfe: "/arquivos/x.pdf",
          protocolo_nota_fiscal: { numero_protocolo: "135260000000001" },
        },
      })
      .mockResolvedValueOnce({ status: 200, data: "<nfeProc>ok</nfeProc>" });
    const r = await sincronizarNota("nf1", { empresaId: "A", agora: AGORA });
    expect(r).toMatchObject({ status: "AUTORIZADA", mudou: true });
    expect(http.get.mock.calls[0][0]).toBe("https://homologacao.focusnfe.com.br/v2/nfe/venda-v1?completa=1");
    expect(http.get.mock.calls[0][1].auth).toEqual({ username: "token-homologacao-teste", password: "" });
    expect(http.get.mock.calls[1][0]).toBe("https://homologacao.focusnfe.com.br/arquivos/x-nfe.xml");
    expect(db.tx.notaFiscal.updateMany).toHaveBeenCalledWith({
      where: { id: "nf1", status: "EMITINDO" },
      data: {
        status: "AUTORIZADA",
        chaveAcesso: CHAVE,
        numero: 123,
        serie: "1",
        protocolo: "135260000000001",
        mensagemSefaz: "100 - Autorizado o uso da NF-e",
        xmlAutorizado: "<nfeProc>ok</nfeProc>",
        danfeUrl: "https://homologacao.focusnfe.com.br/arquivos/x.pdf",
        dataAutorizacao: AGORA,
      },
    });
    expect(db.prisma.notaFiscal.findFirst.mock.calls[0][0].where).toEqual({ id: "nf1", empresaId: "A" });
    expect(db.tx.venda.update).not.toHaveBeenCalled();
  });

  it("processando: não muda nada", async () => {
    http.get.mockResolvedValueOnce({ status: 200, data: { status: "processando_autorizacao" } });
    const r = await sincronizarNota("nf1", { agora: AGORA });
    expect(r).toMatchObject({ status: "EMITINDO", mudou: false });
    expect(db.tx.notaFiscal.updateMany).not.toHaveBeenCalled();
  });

  it("erro na SEFAZ (nota de venda): REJEITADA, venda volta para PAGA sem notaFiscalId e grava auditoria", async () => {
    http.get.mockResolvedValueOnce({ status: 200, data: { status: "erro_autorizacao", status_sefaz: "778", mensagem_sefaz: "Rejeicao: NCM inexistente" } });
    const r = await sincronizarNota("nf1", { empresaId: "A", usuarioId: "u1", agora: AGORA });
    expect(r).toMatchObject({ status: "REJEITADA", mudou: true, mensagem: "778 - Rejeicao: NCM inexistente" });
    expect(db.tx.notaFiscal.updateMany).toHaveBeenCalledWith({
      where: { id: "nf1", status: "EMITINDO" },
      data: { status: "REJEITADA", mensagemSefaz: "778 - Rejeicao: NCM inexistente" },
    });
    expect(db.tx.venda.findFirst.mock.calls[0][0].where).toEqual({ notaFiscalId: "nf1", empresaId: "A" });
    expect(db.tx.venda.update).toHaveBeenCalledWith({ where: { id: "v1" }, data: { notaFiscalId: null, status: "PAGA" } });
    expect(db.tx.logAuditoria.create.mock.calls[0][0].data).toMatchObject({
      usuarioId: "u1",
      acao: "NFE_RECUSADA_VENDA_REABERTA",
      entidade: "Venda",
      entidadeId: "v1",
      dadosAntes: { status: "FATURADA", notaFiscalId: "nf1" },
      dadosDepois: { status: "PAGA", notaFiscalId: null, notaStatus: "REJEITADA" },
    });
  });

  it("erro na SEFAZ (nota de devolução): devolve a reserva, desliga o RMA e grava auditoria", async () => {
    db.prisma.notaFiscal.findFirst.mockResolvedValue({
      ...NOTA_VENDA, id: "nf2", refProvedor: "devolucao-abc", finalidade: 4,
      devolucaoItens: [{ itemVendaId: "iv1", quantidade: 2 }],
    });
    http.get.mockResolvedValueOnce({ status: 200, data: { status: "erro_autorizacao", mensagem_sefaz: "Rejeicao" } });
    await sincronizarNota("nf2", { agora: AGORA });
    expect(db.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(db.tx.solicitacaoRMA.updateMany).toHaveBeenCalledWith({ where: { empresaId: "A", notaDevolucaoId: "nf2" }, data: { notaDevolucaoId: null } });
    expect(db.tx.logAuditoria.create.mock.calls[0][0].data.acao).toBe("NFE_DEVOLUCAO_RECUSADA");
    expect(db.tx.venda.update).not.toHaveBeenCalled();
  });

  it("idempotente: se outro processo já aplicou (count 0), não desfaz a venda de novo", async () => {
    db.tx.notaFiscal.updateMany.mockResolvedValue({ count: 0 });
    http.get.mockResolvedValueOnce({ status: 200, data: { status: "erro_autorizacao", mensagem_sefaz: "x" } });
    const r = await sincronizarNota("nf1", { agora: AGORA });
    expect(r.mudou).toBe(false);
    expect(db.tx.venda.update).not.toHaveBeenCalled();
  });

  it("nota que já não está EMITINDO não consulta a Focus", async () => {
    db.prisma.notaFiscal.findFirst.mockResolvedValue({ ...NOTA_VENDA, status: "AUTORIZADA" });
    const r = await sincronizarNota("nf1", { agora: AGORA });
    expect(r).toMatchObject({ status: "AUTORIZADA", mudou: false });
    expect(http.get).not.toHaveBeenCalled();
  });

  it("404 da Focus: espera 5 minutos antes de dar como não recebida", async () => {
    http.get.mockResolvedValue({ status: 404, data: { codigo: "nao_encontrado" } });
    db.prisma.notaFiscal.findFirst.mockResolvedValue({ ...NOTA_VENDA, dataEmissao: new Date("2026-11-04T14:58:00Z") });
    expect((await sincronizarNota("nf1", { agora: AGORA })).mudou).toBe(false);
    db.prisma.notaFiscal.findFirst.mockResolvedValue({ ...NOTA_VENDA, dataEmissao: new Date("2026-11-04T14:50:00Z") });
    expect(await sincronizarNota("nf1", { agora: AGORA })).toMatchObject({ status: "REJEITADA", mudou: true });
  });

  it("sem token da Focus: 422 sem consultar", async () => {
    delete process.env.FOCUS_NFE_TOKEN;
    await expect(sincronizarNota("nf1", { agora: AGORA })).rejects.toThrow("falta o token da Focus NFe");
    expect(http.get).not.toHaveBeenCalled();
  });
});

describe("sincronizarPendentes (job)", () => {
  it("busca só EMITINDO com mais de 1 minuto, mais antigas primeiro, com limite", async () => {
    db.prisma.notaFiscal.findMany.mockResolvedValue([{ id: "nf1" }]);
    http.get.mockResolvedValue({ status: 200, data: { status: "processando_autorizacao" } });
    const r = await sincronizarPendentes({ limite: 10, agora: AGORA });
    expect(r).toHaveLength(1);
    expect(db.prisma.notaFiscal.findMany).toHaveBeenCalledWith({
      where: {
        status: "EMITINDO",
        modelo: { in: ["NFE_55", "NFCE_65"] },
        refProvedor: { not: null },
        dataEmissao: { lt: new Date("2026-11-04T14:59:00Z") },
      },
      orderBy: { dataEmissao: "asc" },
      take: 10,
      select: { id: true },
    });
  });
});
