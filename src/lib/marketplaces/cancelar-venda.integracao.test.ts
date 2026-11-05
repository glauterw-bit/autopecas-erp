// Cancelamento de pedido já importado, contra Postgres com as migrações aplicadas.
// Só roda com MARKETPLACES_TEST_DATABASE_URL (nunca aponte para produção):
//   MARKETPLACES_TEST_DATABASE_URL=postgresql://localhost:5432/autopecas_erp_r2integ npm test
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { cancelarVendaMarketplace } from "./cancelar-venda";

const URL = process.env.MARKETPLACES_TEST_DATABASE_URL;

describe.skipIf(!URL)("cancelar venda de marketplace (banco)", () => {
  const db = URL ? new PrismaClient({ datasources: { db: { url: URL } } }) : (undefined as unknown as PrismaClient);
  const suf = Date.now().toString();
  let empresaId = "", contaId = "", produtoId = "", depositoId = "";

  async function criarVenda(externoId: string, numero: number, nota: boolean) {
    const venda = await db.venda.create({
      data: {
        empresaId, numero, tipo: "VENDA", origem: "MARKETPLACE_ML", externoId, status: "PAGA",
        valorBruto: 100, valorTotal: 100, custoTotal: 50, margemBruta: 50, margemPercent: 0.5,
        itens: { create: [{ produtoId, quantidade: 2, precoUnitario: 50, custoUnitario: 25, desconto: 0, total: 100, margem: 50 }] },
      },
    });
    await db.estoqueDeposito.update({ where: { produtoId_depositoId: { produtoId, depositoId } }, data: { quantidade: { decrement: 2 } } });
    await db.movimentoEstoque.create({
      data: { produtoId, depositoId, tipo: "SAIDA", quantidade: 2, custoUnitario: 25, origemTipo: "VENDA", origemId: venda.id },
    });
    await db.contaReceber.create({
      data: { empresaId, vendaId: venda.id, descricao: "ML", formaPagamento: "PIX", dataVencimento: new Date(), valor: 100 },
    });
    if (nota) {
      const nf = await db.notaFiscal.create({
        data: { empresaId, modelo: "NFE_55", serie: "1", numero: numero + 900, status: "AUTORIZADA", naturezaOperacao: "Venda", valorProdutos: 100, valorTotal: 100 },
      });
      await db.venda.update({ where: { id: venda.id }, data: { notaFiscalId: nf.id } });
    }
    return venda;
  }
  const saldo = async () =>
    Number((await db.estoqueDeposito.findUniqueOrThrow({ where: { produtoId_depositoId: { produtoId, depositoId } } })).quantidade);

  beforeAll(async () => {
    empresaId = (await db.empresa.create({ data: { razaoSocial: "EMPRESA TESTE CANCELA ML", cnpj: `8${suf}`.slice(0, 14) } })).id;
    depositoId = (await db.deposito.create({ data: { empresaId, nome: "Loja" } })).id;
    produtoId = (await db.produto.create({ data: { empresaId, sku: `T-${suf}`, nome: "PECA TESTE", custoMedio: 25, precoVenda: 50 } })).id;
    await db.estoqueDeposito.create({ data: { produtoId, depositoId, quantidade: 10 } });
    contaId = (await db.marketplaceConta.create({ data: { empresaId, plataforma: "MERCADO_LIVRE", nomeReferencia: "teste" } })).id;
  });

  afterAll(async () => {
    const ids = (await db.venda.findMany({ where: { empresaId }, select: { id: true } })).map((v) => v.id);
    await db.logAuditoria.deleteMany({ where: { entidade: "Venda", entidadeId: { in: ids } } });
    await db.movimentoEstoque.deleteMany({ where: { produtoId } });
    await db.contaReceber.deleteMany({ where: { empresaId } });
    await db.empresa.delete({ where: { id: empresaId } }).catch(() => undefined);
    await db.$disconnect();
  });

  it("estorna uma vez só: estoque volta, conta cancelada, auditoria gravada", async () => {
    await criarVenda("ML-1", 1, false);
    expect(await saldo()).toBe(8);
    const a = { empresaId, contaId, pedidoIdExterno: "1", externoId: "ML-1" };
    expect(await cancelarVendaMarketplace(a, db)).toMatchObject({ status: "CANCELADA", itensDevolvidos: 1, contasCanceladas: 1 });
    expect(await saldo()).toBe(10);
    expect((await cancelarVendaMarketplace(a, db)).status).toBe("JA_CANCELADA"); // reentrega
    expect(await saldo()).toBe(10);
    const v = await db.venda.findFirstOrThrow({ where: { empresaId, externoId: "ML-1" } });
    expect(v.status).toBe("CANCELADA");
    expect(await db.logAuditoria.count({ where: { entidade: "Venda", entidadeId: v.id, acao: "VENDA_CANCELADA_MARKETPLACE" } })).toBe(1);
  });

  it("venda com nota autorizada: não cancela, pede revisão humana, alerta uma vez só", async () => {
    await criarVenda("ML-2", 2, true);
    const antes = await saldo();
    const a = { empresaId, contaId, pedidoIdExterno: "2", externoId: "ML-2" };
    await db.marketplacePedido.create({ data: { contaId, pedidoIdExterno: "2", status: "cancelled", valorTotal: 100, dataPedido: new Date(), payloadOriginal: {} } });
    expect((await cancelarVendaMarketplace(a, db)).status).toBe("REVISAO_HUMANA");
    expect((await cancelarVendaMarketplace(a, db)).status).toBe("REVISAO_HUMANA");
    const v = await db.venda.findFirstOrThrow({ where: { empresaId, externoId: "ML-2" } });
    expect(v.status).toBe("PAGA");
    expect(await saldo()).toBe(antes);
    expect(await db.insightIA.count({ where: { empresaId, titulo: { contains: "nota fiscal emitida" } } })).toBe(1);
  });

  it("pedido que nunca virou venda: nada a fazer", async () => {
    expect((await cancelarVendaMarketplace({ empresaId, contaId, pedidoIdExterno: "9", externoId: "ML-9" }, db)).status).toBe("SEM_VENDA");
  });
});
