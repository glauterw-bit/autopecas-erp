// Devolução contra um Postgres de verdade (condição de corrida, travas e reservas).
// Roda só com DEVOLUCAO_TEST_DATABASE_URL (banco descartável, nunca produção):
//   DEVOLUCAO_TEST_DATABASE_URL=postgresql://localhost:5432/autopecas_erp_r2dev npx vitest run src/lib/nfe/devolucao.integracao.test.ts
// A Focus é simulada (axios mockado): nada é transmitido.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const URL = process.env.DEVOLUCAO_TEST_DATABASE_URL;
if (URL) process.env.DATABASE_URL = URL;

const http = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock("axios", () => ({ default: http }));
const sessao = vi.hoisted(() => ({ usuario: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth/config", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/config")>()),
  usuarioDaSessao: async () => sessao.usuario,
}));

describe.skipIf(!URL)("devolução contra o banco", () => {
  let db: PrismaClient;
  let devolucao: typeof import("./devolucao");
  let sincronizar: typeof import("./sincronizar");
  let rma: typeof import("../rma/rma");
  let rotaDevolucao: typeof import("@/app/api/vendas/devolucao/route");
  const sufixo = String(Date.now()).slice(-8);
  const CNPJ_A = `11${sufixo}0001`.slice(0, 14).padEnd(14, "0");
  const CNPJ_B = `22${sufixo}0001`.slice(0, 14).padEnd(14, "0");
  const ids = { A: "", B: "", userA: "", userB: "", deposito: "", produto: "", cliente: "" };
  let numeroVenda = 1000;

  const retrato = {
    cfop: "5102", cstIcms: "00", aliquotaIcms: 18, cstPis: "04", cstCofins: "04", monofasico: true,
    cstIbsCbs: "000", cClassTrib: "000001", ncm: "87083090", cest: "0100100", origem: 0,
  };

  /** Venda FATURADA com nota AUTORIZADA e um item de `qtd` unidades. */
  async function novaVenda(qtd = 2) {
    numeroVenda++;
    const chave = `3526${"11"}${CNPJ_A}55001${String(numeroVenda).padStart(9, "0")}1${String(numeroVenda).padStart(8, "0")}0`;
    const nf = await db.notaFiscal.create({
      data: {
        empresaId: ids.A, modelo: "NFE_55", serie: "1", numero: numeroVenda, chaveAcesso: chave, status: "AUTORIZADA",
        ambiente: "HOMOLOGACAO", naturezaOperacao: "VENDA", valorProdutos: 300, valorTotal: 300,
      },
    });
    const venda = await db.venda.create({
      data: {
        empresaId: ids.A, numero: numeroVenda, tipo: "VENDA", status: "FATURADA", origem: "BALCAO",
        clienteId: ids.cliente, notaFiscalId: nf.id, valorTotal: 150 * qtd,
        itens: {
          create: [{
            produtoId: ids.produto, quantidade: qtd, precoUnitario: 150, custoUnitario: 80, total: 150 * qtd,
            numeroItemNota: 1, fiscalNota: retrato,
          }],
        },
      },
      include: { itens: true },
    });
    return { venda, item: venda.itens[0] };
  }

  const estoque = async () =>
    Number((await db.estoqueDeposito.findUnique({ where: { produtoId_depositoId: { produtoId: ids.produto, depositoId: ids.deposito } } }))?.quantidade ?? 0);
  const devolvidoNota = async (id: string) => Number((await db.itemVenda.findUniqueOrThrow({ where: { id } })).quantidadeDevolvidaNota);

  beforeAll(async () => {
    devolucao = await import("./devolucao");
    sincronizar = await import("./sincronizar");
    rma = await import("../rma/rma");
    rotaDevolucao = await import("@/app/api/vendas/devolucao/route");
    db = (await import("../db")).prisma;
    const a = await db.empresa.create({
      data: {
        razaoSocial: "LOJA TESTE DEVOLUCAO A", cnpj: CNPJ_A, uf: "SP", inscEstadual: "123456789012", regimeTributario: "LUCRO_PRESUMIDO",
        logradouro: "Rua A", numero: "1", bairro: "Centro", municipio: "Cotia", cep: "06700000",
        // Checklist de prontidão fiscal completo (token fica no env, como reserva).
        configuracoes: {
          fiscal: {
            focus: { serieNfe: "1", serieNfce: "1" },
            certificado: { validoAte: "2099-01-01T00:00:00.000Z", origem: "informado", atualizadoEm: "2026-11-05T00:00:00.000Z" },
            ibsCbs: { cst: "000", cClassTrib: "000001" },
          },
        },
      },
    });
    const b = await db.empresa.create({ data: { razaoSocial: "LOJA TESTE DEVOLUCAO B", cnpj: CNPJ_B, uf: "SP" } });
    ids.A = a.id;
    ids.B = b.id;
    ids.userA = (await db.usuario.create({ data: { empresaId: a.id, nome: "Teste A", email: `a${sufixo}@teste.local`, senhaHash: "x", perfil: "GERENTE" } })).id;
    ids.userB = (await db.usuario.create({ data: { empresaId: b.id, nome: "Teste B", email: `b${sufixo}@teste.local`, senhaHash: "x", perfil: "GERENTE" } })).id;
    ids.deposito = (await db.deposito.create({ data: { empresaId: a.id, nome: "Loja" } })).id;
    await db.deposito.create({ data: { empresaId: b.id, nome: "Loja B" } });
    ids.produto = (await db.produto.create({
      data: { empresaId: a.id, sku: "PAST-001", nome: "Pastilha de freio dianteira", ncm: "87083090", cest: "0100100", unidade: "JG" },
    })).id;
    ids.cliente = (await db.cliente.create({
      data: {
        empresaId: a.id, nome: "Cliente Teste", cpfCnpj: "12345678909", tipo: "PF",
        logradouro: "Rua A", numero: "100", bairro: "Centro", municipio: "Cotia", uf: "SP", cep: "06700000",
      },
    })).id;
  });

  afterAll(async () => {
    if (!db) return;
    const empresas = [ids.A, ids.B].filter(Boolean);
    await db.movimentoEstoque.deleteMany({ where: { produtoId: ids.produto } });
    await db.logAuditoria.deleteMany({ where: { usuarioId: { in: [ids.userA, ids.userB] } } });
    await db.logAuditoria.deleteMany({ where: { usuarioId: null, entidade: { in: ["NotaFiscal", "Venda"] }, criadoEm: { gte: new Date(Date.now() - 3_600_000) } } });
    await db.solicitacaoRMA.deleteMany({ where: { empresaId: { in: empresas } } });
    await db.venda.deleteMany({ where: { empresaId: { in: empresas } } });
    await db.empresa.deleteMany({ where: { id: { in: empresas } } });
    await db.$disconnect();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FOCUS_NFE_TOKEN = "token-de-homologacao-falso";
    delete process.env.FOCUS_NFE_AMBIENTE;
    // Resposta normal da NF-e 55: assíncrona.
    http.post.mockResolvedValue({ status: 202, data: { status: "processando_autorizacao" } });
    sessao.usuario = { id: ids.userA, nome: "Teste A", email: "a@t", perfil: "GERENTE", ativo: true, empresaId: ids.A, permissoes: [] };
  });

  // ---------------- 1. NF-e de devolução ----------------
  it("item repetido: 2 vendidas, [{iv,2},{iv,2}] é bloqueado e nada é reservado", async () => {
    const { venda, item } = await novaVenda(2);
    await expect(
      devolucao.emitirNotaDevolucao({ empresaId: ids.A, vendaId: venda.id, itens: [{ itemVendaId: item.id, quantidade: 2 }, { itemVendaId: item.id, quantidade: 2 }] }),
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining("só 2 unidade(s)") });
    expect(await devolvidoNota(item.id)).toBe(0);
    expect(http.post).not.toHaveBeenCalled();
    expect(await db.notaFiscal.count({ where: { empresaId: ids.A, finalidade: 4 } })).toBe(0);
  });

  it("dois cliques simultâneos (Promise.all): uma nota só, reserva 2 e uma chamada à Focus", async () => {
    const { venda, item } = await novaVenda(2);
    const pedido = { empresaId: ids.A, vendaId: venda.id, itens: [{ itemVendaId: item.id, quantidade: 2 }] };
    const [n1, n2] = await Promise.all([devolucao.emitirNotaDevolucao(pedido), devolucao.emitirNotaDevolucao(pedido)]);
    expect(n1.id).toBe(n2.id);
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(await devolvidoNota(item.id)).toBe(2);
    const notas = await db.notaFiscal.findMany({ where: { empresaId: ids.A, refProvedor: n1.refProvedor } });
    expect(notas).toHaveLength(1);
    expect(notas[0]).toMatchObject({ status: "EMITINDO", finalidade: 4, devolucaoItens: [{ itemVendaId: item.id, quantidade: 2 }] });
    // nova tentativa com a nota ainda EMITINDO: devolve a mesma nota, sem nova chamada à Focus
    const n3 = await devolucao.emitirNotaDevolucao(pedido);
    expect(n3.id).toBe(n1.id);
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(await devolvidoNota(item.id)).toBe(2);
    // pedido diferente (1 unidade) sem saldo restante: recusado
    await expect(
      devolucao.emitirNotaDevolucao({ ...pedido, itens: [{ itemVendaId: item.id, quantidade: 1 }] }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("dois pedidos diferentes ao mesmo tempo (1 e 2 de 2): nunca passa de 2", async () => {
    const { venda, item } = await novaVenda(2);
    const r = await Promise.allSettled([
      devolucao.emitirNotaDevolucao({ empresaId: ids.A, vendaId: venda.id, itens: [{ itemVendaId: item.id, quantidade: 1 }] }),
      devolucao.emitirNotaDevolucao({ empresaId: ids.A, vendaId: venda.id, itens: [{ itemVendaId: item.id, quantidade: 2 }] }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await devolvidoNota(item.id)).toBeLessThanOrEqual(2);
  });

  it("Focus recusa: nota REJEITADA e reserva devolvida; nova tentativa usa o mesmo ref", async () => {
    const { venda, item } = await novaVenda(2);
    http.post.mockResolvedValueOnce({ status: 422, data: { status: "erro_autorizacao", mensagem_sefaz: "Rejeicao 321" } });
    const pedido = { empresaId: ids.A, vendaId: venda.id, itens: [{ itemVendaId: item.id, quantidade: 1 }] };
    await expect(devolucao.emitirNotaDevolucao(pedido)).rejects.toMatchObject({ status: 422, message: expect.stringContaining("Rejeicao 321") });
    expect(await devolvidoNota(item.id)).toBe(0);
    const rejeitada = await db.notaFiscal.findFirstOrThrow({ where: { empresaId: ids.A, status: "REJEITADA", finalidade: 4 }, orderBy: { dataEmissao: "desc" } });
    const nova = await devolucao.emitirNotaDevolucao(pedido);
    expect(nova.refProvedor).toBe(rejeitada.refProvedor);
    expect(await devolvidoNota(item.id)).toBe(1);
  });

  it("consulta depois: erro_autorizacao na SEFAZ devolve a reserva (job/botão)", async () => {
    const { venda, item } = await novaVenda(2);
    const nota = await devolucao.emitirNotaDevolucao({ empresaId: ids.A, vendaId: venda.id, itens: [{ itemVendaId: item.id, quantidade: 2 }] });
    expect(await devolvidoNota(item.id)).toBe(2);
    http.get.mockResolvedValueOnce({ status: 200, data: { status: "erro_autorizacao", status_sefaz: "321", mensagem_sefaz: "Rejeicao" } });
    const r = await sincronizar.sincronizarNota(nota.id, { empresaId: ids.A });
    expect(r).toMatchObject({ status: "REJEITADA", mudou: true });
    expect(await devolvidoNota(item.id)).toBe(0);
  });

  it("nota de VENDA recusada na consulta: venda volta para PAGA, sem notaFiscalId, com auditoria", async () => {
    numeroVenda++;
    const nf = await db.notaFiscal.create({
      data: { empresaId: ids.A, modelo: "NFE_55", serie: "1", numero: -numeroVenda, status: "EMITINDO", refProvedor: `venda-t${numeroVenda}`,
        ambiente: "HOMOLOGACAO", naturezaOperacao: "VENDA", valorProdutos: 10, valorTotal: 10 },
    });
    const venda = await db.venda.create({ data: { empresaId: ids.A, numero: numeroVenda, status: "FATURADA", notaFiscalId: nf.id } });
    http.get.mockResolvedValueOnce({ status: 200, data: { status: "erro_autorizacao", mensagem_sefaz: "Rejeicao: NCM inexistente" } });
    await sincronizar.sincronizarNota(nf.id, { empresaId: ids.A, usuarioId: ids.userA });
    expect(await db.venda.findUniqueOrThrow({ where: { id: venda.id } })).toMatchObject({ status: "PAGA", notaFiscalId: null });
    expect(await db.logAuditoria.count({ where: { entidadeId: venda.id, acao: "NFE_RECUSADA_VENDA_REABERTA" } })).toBe(1);
  });

  // ---------------- 2. RMA: dois cliques ----------------
  it("RMA: dois cliques simultâneos geram uma nota só e o RMA fica ligado a ela", async () => {
    const { venda, item } = await novaVenda(2);
    const r = await rma.abrirRMA({ empresaId: ids.A, vendaId: venda.id, itemVendaId: item.id, produtoId: ids.produto, motivo: "PECA_ERRADA", quantidade: 1 });
    await db.solicitacaoRMA.update({ where: { id: r.id }, data: { status: "RECEBIDA" } });
    const [n1, n2] = await Promise.all([rma.emitirNotaDevolucaoRMA(r.id, ids.A), rma.emitirNotaDevolucaoRMA(r.id, ids.A)].map((p) => p.catch((e) => e)));
    const notas = [n1, n2].filter((x) => x && "id" in x);
    expect(new Set(notas.map((n) => n.id)).size).toBe(1);
    expect(http.post).toHaveBeenCalledTimes(1);
    expect((await db.solicitacaoRMA.findUniqueOrThrow({ where: { id: r.id } })).notaDevolucaoId).toBe(notas[0].id);
    await expect(rma.emitirNotaDevolucaoRMA(r.id, ids.A)).rejects.toMatchObject({ status: 422 });
  });

  it("RMA pedindo com nota de balcão em voo: nunca recebe a nota do balcão", async () => {
    const { venda, item } = await novaVenda(2);
    const balcao = await devolucao.emitirNotaDevolucao({ empresaId: ids.A, vendaId: venda.id, itens: [{ itemVendaId: item.id, quantidade: 1 }] });
    expect(balcao.status).toBe("EMITINDO");
    const r = await db.solicitacaoRMA.create({
      data: { empresaId: ids.A, numeroRMA: ++numeroVenda, vendaId: venda.id, itemVendaId: item.id, produtoId: ids.produto, motivo: "PECA_ERRADA", quantidade: 1, status: "RECEBIDA" },
    });
    const res = await rma.emitirNotaDevolucaoRMA(r.id, ids.A).catch((e) => e);
    if ("id" in res) {
      expect(res.id).not.toBe(balcao.id);
      expect((await db.solicitacaoRMA.findUniqueOrThrow({ where: { id: r.id } })).notaDevolucaoId).toBe(res.id);
      expect(await devolvidoNota(item.id)).toBe(2);
    } else {
      expect(res).toMatchObject({ status: expect.any(Number) });
      expect((await db.solicitacaoRMA.findUniqueOrThrow({ where: { id: r.id } })).notaDevolucaoId).toBeNull();
      expect(await devolvidoNota(item.id)).toBe(1);
    }
    // sem saldo (a venda toda reservada): outro RMA é recusado e a nota do balcão fica intacta
    const r2 = await db.solicitacaoRMA.create({
      data: { empresaId: ids.A, numeroRMA: ++numeroVenda, vendaId: venda.id, itemVendaId: item.id, produtoId: ids.produto, motivo: "PECA_ERRADA", quantidade: 1, status: "RECEBIDA" },
    });
    if ("id" in res) {
      await expect(rma.emitirNotaDevolucaoRMA(r2.id, ids.A)).rejects.toMatchObject({ status: 422 });
      expect((await db.solicitacaoRMA.findUniqueOrThrow({ where: { id: r2.id } })).notaDevolucaoId).toBeNull();
    }
  });

  it("duas devoluções legítimas de 1 unidade (venda de 2): 1ª em voo com o mesmo pedido é clique duplo; depois de autorizada, a 2ª gera outra nota", async () => {
    const { venda, item } = await novaVenda(2);
    const pedido = { empresaId: ids.A, vendaId: venda.id, itens: [{ itemVendaId: item.id, quantidade: 1 }] };
    const n1 = await devolucao.emitirNotaDevolucao(pedido);
    // pedido idêntico enquanto a 1ª está em voo é indistinguível de clique duplo: mesma nota, estoque da nota reservado uma vez
    expect((await devolucao.emitirNotaDevolucao(pedido)).id).toBe(n1.id);
    expect(await devolvidoNota(item.id)).toBe(1);
    await db.notaFiscal.update({ where: { id: n1.id }, data: { status: "AUTORIZADA" } });
    const n2 = await devolucao.emitirNotaDevolucao(pedido);
    expect(n2.id).not.toBe(n1.id);
    expect(n2.refProvedor).not.toBe(n1.refProvedor);
    expect(await devolvidoNota(item.id)).toBe(2);
    expect(http.post).toHaveBeenCalledTimes(2);
    await expect(
      devolucao.emitirNotaDevolucao({ ...pedido, itens: [{ itemVendaId: item.id, quantidade: 2 }] }),
    ).rejects.toMatchObject({ status: 422 });
  });

  // ---------------- 6. balcão x RMA ----------------
  async function devolverBalcao(vendaId: string, itens: Array<{ itemVendaId: string; quantidade: number }>, motivo = "DESISTENCIA") {
    const { NextRequest } = await import("next/server");
    return rotaDevolucao.POST(
      new NextRequest("https://erp.exemplo.com.br/api/vendas/devolucao", { method: "POST", body: JSON.stringify({ vendaId, motivo, itens }) }),
      {} as never,
    );
  }

  it("balcão: duas devoluções simultâneas do mesmo item não devolvem o estoque em dobro", async () => {
    const { venda, item } = await novaVenda(2);
    const antes = await estoque();
    const [r1, r2] = await Promise.all([
      devolverBalcao(venda.id, [{ itemVendaId: item.id, quantidade: 2 }]),
      devolverBalcao(venda.id, [{ itemVendaId: item.id, quantidade: 2 }]),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    expect(await estoque()).toBe(antes + 2);
  });

  it("balcão devolveu tudo → RMA do mesmo item é recusado; RMA aberto → balcão recusa; resolver 2x não duplica", async () => {
    const v1 = await novaVenda(2);
    expect((await devolverBalcao(v1.venda.id, [{ itemVendaId: v1.item.id, quantidade: 2 }])).status).toBe(201);
    await expect(
      rma.abrirRMA({ empresaId: ids.A, vendaId: v1.venda.id, itemVendaId: v1.item.id, produtoId: ids.produto, motivo: "PECA_ERRADA", quantidade: 1 }),
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining("Só 0 unidade(s)") });

    const v2 = await novaVenda(2);
    const r = await rma.abrirRMA({ empresaId: ids.A, vendaId: v2.venda.id, produtoId: ids.produto, motivo: "PECA_ERRADA", quantidade: 2 });
    expect(r.itemVendaId).toBe(v2.item.id); // achou o item pela peça
    const resp = await devolverBalcao(v2.venda.id, [{ itemVendaId: v2.item.id, quantidade: 1 }]);
    expect(resp.status).toBe(422);
    const antes = await estoque();
    const res = await Promise.allSettled([
      rma.resolverRMA({ rmaId: r.id, empresaId: ids.A, resolucao: "REEMBOLSO" }),
      rma.resolverRMA({ rmaId: r.id, empresaId: ids.A, resolucao: "REEMBOLSO" }),
    ]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await estoque()).toBe(antes + 2);
  });

  it("garantia/defeito: não volta ao estoque, mas grava LogAuditoria com antes e depois", async () => {
    const { venda, item } = await novaVenda(1);
    const antes = await estoque();
    expect((await devolverBalcao(venda.id, [{ itemVendaId: item.id, quantidade: 1 }], "GARANTIA_DEFEITO")).status).toBe(201);
    expect(await estoque()).toBe(antes);
    const log = await db.logAuditoria.findFirstOrThrow({ where: { entidadeId: item.id, acao: "RETORNO_SEM_ESTOQUE" } });
    expect(log.dadosAntes).toMatchObject({ jaDevolvido: 0, quantidadeVendida: 1 });
    expect(log.dadosDepois).toMatchObject({ jaDevolvido: 1, voltaEstoque: false, motivo: "GARANTIA_DEFEITO" });
  });

  // ---------------- 7. RMA entre empresas ----------------
  it("RMA: empresa B não abre RMA com venda/produto da A (404) e nada é gravado", async () => {
    const { venda, item } = await novaVenda(1);
    await expect(
      rma.abrirRMA({ empresaId: ids.B, vendaId: venda.id, itemVendaId: item.id, produtoId: ids.produto, motivo: "PECA_ERRADA", quantidade: 1 }),
    ).rejects.toMatchObject({ status: 404 });
    // produto da B não existe; produto da A com venda da A, mas pela B: 404 no produto
    await expect(rma.abrirRMA({ empresaId: ids.B, produtoId: ids.produto, motivo: "OUTROS", quantidade: 1 })).rejects.toMatchObject({ status: 404 });
    expect(await db.solicitacaoRMA.count({ where: { empresaId: ids.B } })).toBe(0);
    // e resolver um RMA da A pela B não acha
    const r = await rma.abrirRMA({ empresaId: ids.A, vendaId: venda.id, produtoId: ids.produto, motivo: "OUTROS", quantidade: 1 });
    await expect(rma.resolverRMA({ rmaId: r.id, empresaId: ids.B, resolucao: "REEMBOLSO" })).rejects.toMatchObject({ status: 404 });
  });

  it("RMA: peça que não está na venda é recusada", async () => {
    const { venda } = await novaVenda(1);
    const outro = await db.produto.create({ data: { empresaId: ids.A, sku: `OUT-${sufixo}`, nome: "Outra peça" } });
    await expect(
      rma.abrirRMA({ empresaId: ids.A, vendaId: venda.id, produtoId: outro.id, motivo: "OUTROS", quantidade: 1 }),
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining("não faz parte da venda") });
    await db.produto.delete({ where: { id: outro.id } });
  });
});
