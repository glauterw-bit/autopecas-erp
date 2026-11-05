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
      insightIA: { findFirst: vi.fn(), create: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
vi.mock("../db", () => ({ prisma: db.prisma }));
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("axios", () => ({ default: http }));

import { interpretarConsulta, proximaConsulta, sincronizarNota, sincronizarPendentes } from "./sincronizar";

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

describe("ambiente da nota na consulta", () => {
  it("nota HOMOLOGACAO com a empresa já em produção é consultada na homologação, com o token da homologação", async () => {
    process.env.FOCUS_NFE_AMBIENTE = "producao";
    process.env.FOCUS_NFE_TOKEN = "token-producao";
    process.env.FOCUS_NFE_TOKEN_HOMOLOGACAO = "token-homolog";
    db.prisma.notaFiscal.findFirst.mockResolvedValue({
      ...NOTA_VENDA,
      ambiente: "HOMOLOGACAO",
      empresa: { cnpj: "12345678000195", configuracoes: { fiscal: { focus: { ambiente: "producao" } } } },
    });
    http.get.mockResolvedValue({ status: 200, data: { status: "processando_autorizacao" } });
    await sincronizarNota("nf1");
    expect(http.get.mock.calls[0][0]).toContain("https://homologacao.focusnfe.com.br/v2/nfe/");
    expect(http.get.mock.calls[0][1].auth.username).toBe("token-homolog");
    delete process.env.FOCUS_NFE_TOKEN_HOMOLOGACAO;
  });

  it("nota PRODUCAO consulta o host de produção mesmo com a empresa em homologação", async () => {
    process.env.FOCUS_NFE_TOKEN_PRODUCAO = "token-prod";
    db.prisma.notaFiscal.findFirst.mockResolvedValue({ ...NOTA_VENDA, ambiente: "PRODUCAO" });
    http.get.mockResolvedValue({ status: 200, data: { status: "processando_autorizacao" } });
    await sincronizarNota("nf1");
    expect(http.get.mock.calls[0][0]).toContain("https://api.focusnfe.com.br/v2/nfe/");
    expect(http.get.mock.calls[0][1].auth.username).toBe("token-prod");
    delete process.env.FOCUS_NFE_TOKEN_PRODUCAO;
  });

  it("sem token do ambiente da nota (e ambiente diferente do atual): não consulta com o token errado", async () => {
    process.env.FOCUS_NFE_AMBIENTE = "producao";
    db.prisma.notaFiscal.findFirst.mockResolvedValue({
      ...NOTA_VENDA,
      ambiente: "HOMOLOGACAO",
      empresa: { cnpj: "12345678000195", configuracoes: { fiscal: { focus: { ambiente: "producao" } } } },
    });
    await expect(sincronizarNota("nf1")).rejects.toMatchObject({ status: 422 });
    expect(http.get).not.toHaveBeenCalled();
  });
});

describe("proximaConsulta (agenda)", () => {
  const emissao = new Date("2026-11-04T10:00:00Z");
  const em = (min: number) => new Date(emissao.getTime() + min * 60_000);
  it("espaça 1, 5, 15 e 60 min e depois de hora em hora", () => {
    const agora = em(2);
    const minutos = [1, 2, 3, 4, 5, 9].map((t) => {
      const a = proximaConsulta(t, emissao, agora);
      return a.tipo === "agendar" ? (a.proximaEm.getTime() - agora.getTime()) / 60_000 : -1;
    });
    expect(minutos).toEqual([1, 5, 15, 60, 60, 60]);
  });
  it("depois de 24 h para e manda para revisão; antes disso ainda agenda", () => {
    expect(proximaConsulta(30, emissao, em(24 * 60 - 1)).tipo).toBe("agendar");
    expect(proximaConsulta(30, emissao, em(24 * 60))).toEqual({ tipo: "revisao" });
  });
});

describe("sincronizarPendentes (job)", () => {
  const dados = (id: string, over = {}) => ({ id, empresaId: "A", ambiente: "HOMOLOGACAO", dataEmissao: new Date("2026-11-04T14:00:00Z"), consultaTentativas: 0, ...over });
  beforeEach(() => {
    db.prisma.insightIA.findFirst.mockResolvedValue(null);
    db.prisma.notaFiscal.updateMany.mockResolvedValue({ count: 1 });
  });

  it("seleciona só EMITINDO com consulta vencida (ou nunca consultada), fora de revisão", async () => {
    db.prisma.notaFiscal.findMany.mockResolvedValue([dados("nf1")]);
    db.prisma.notaFiscal.findFirst.mockResolvedValue(NOTA_VENDA);
    http.get.mockResolvedValue({ status: 200, data: { status: "processando_autorizacao" } });
    const r = await sincronizarPendentes({ limite: 10, agora: AGORA });
    expect(r).toHaveLength(1);
    const arg = db.prisma.notaFiscal.findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      status: "EMITINDO",
      revisaoEm: null,
      dataEmissao: { lt: new Date("2026-11-04T14:59:00Z") },
      OR: [{ proximaConsultaEm: null }, { proximaConsultaEm: { lte: AGORA } }],
    });
    expect(arg.take).toBe(50);
  });

  it("depois de consultar, grava tentativa, última e próxima consulta (1ª tentativa: +1 min)", async () => {
    db.prisma.notaFiscal.findMany.mockResolvedValue([dados("nf1")]);
    db.prisma.notaFiscal.findFirst.mockResolvedValue(NOTA_VENDA);
    http.get.mockResolvedValue({ status: 200, data: { status: "processando_autorizacao" } });
    await sincronizarPendentes({ agora: AGORA });
    expect(db.prisma.notaFiscal.updateMany).toHaveBeenCalledWith({
      where: { id: "nf1", status: "EMITINDO" },
      data: { consultaTentativas: 1, ultimaConsultaEm: AGORA, proximaConsultaEm: new Date("2026-11-04T15:01:00Z") },
    });
  });

  it("teto por empresa: 25 notas da empresa A não impedem a nota da B", async () => {
    const lista = [...Array.from({ length: 25 }, (_, i) => dados(`a${i}`)), dados("b1", { empresaId: "B" })];
    db.prisma.notaFiscal.findMany.mockResolvedValue(lista);
    db.prisma.notaFiscal.findFirst.mockResolvedValue(NOTA_VENDA);
    http.get.mockResolvedValue({ status: 200, data: { status: "processando_autorizacao" } });
    const r = await sincronizarPendentes({ agora: AGORA, porEmpresa: 20 });
    expect(r).toHaveLength(21);
    expect(db.prisma.notaFiscal.updateMany.mock.calls.some((c) => c[0].where.id === "b1")).toBe(true);
    expect(db.prisma.notaFiscal.updateMany.mock.calls.some((c) => c[0].where.id === "a20")).toBe(false);
  });

  it("passou de 24 h: marca revisão, para de agendar e cria alerta", async () => {
    db.prisma.notaFiscal.findMany.mockResolvedValue([dados("nf1", { dataEmissao: new Date("2026-11-03T14:00:00Z"), consultaTentativas: 30 })]);
    db.prisma.notaFiscal.findFirst.mockResolvedValue({ ...NOTA_VENDA, dataEmissao: new Date("2026-11-03T14:00:00Z") });
    http.get.mockResolvedValue({ status: 200, data: { status: "processando_autorizacao" } });
    await sincronizarPendentes({ agora: AGORA });
    expect(db.prisma.notaFiscal.updateMany).toHaveBeenCalledWith({
      where: { id: "nf1", status: "EMITINDO" },
      data: { consultaTentativas: 31, ultimaConsultaEm: AGORA, proximaConsultaEm: null, revisaoEm: AGORA },
    });
    expect(db.prisma.insightIA.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ empresaId: "A", tipo: "NFE_PENDENTE", severidade: "CRITICO" }) }),
    );
  });

  it("401 da Focus: alerta na hora e não consulta mais notas da mesma empresa/ambiente na rodada", async () => {
    db.prisma.notaFiscal.findMany.mockResolvedValue([dados("nf1"), dados("nf2")]);
    db.prisma.notaFiscal.findFirst.mockResolvedValue(NOTA_VENDA);
    http.get.mockResolvedValue({ status: 401, data: {} });
    const r = await sincronizarPendentes({ agora: AGORA });
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(r).toHaveLength(1);
    expect(db.prisma.insightIA.create).toHaveBeenCalledTimes(1);
    expect(db.prisma.insightIA.create.mock.calls[0][0].data).toMatchObject({ tipo: "NFE_PENDENTE", dadosReferencia: { motivo: "TOKEN_FOCUS" } });
  });

  it("alerta já aberto não é repetido", async () => {
    db.prisma.insightIA.findFirst.mockResolvedValue({ id: "i1" });
    db.prisma.notaFiscal.findMany.mockResolvedValue([dados("nf1")]);
    db.prisma.notaFiscal.findFirst.mockResolvedValue(NOTA_VENDA);
    http.get.mockResolvedValue({ status: 403, data: {} });
    await sincronizarPendentes({ agora: AGORA });
    expect(db.prisma.insightIA.create).not.toHaveBeenCalled();
  });
});
