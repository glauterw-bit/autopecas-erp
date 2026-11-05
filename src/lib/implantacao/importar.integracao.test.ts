// Idempotência de verdade, contra um Postgres com as migrações aplicadas.
// Roda só com IMPLANTACAO_TEST_DATABASE_URL (nunca aponte para produção):
//   IMPLANTACAO_TEST_DATABASE_URL=postgresql://localhost:5432/autopecas_erp_implantacao npm test
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { lerCsv } from "./csv";
import { aplicarMapa, sugerirMapa } from "./mapa";
import { importar } from "./importar";
import type { Entidade } from "./tipos";

const URL = process.env.IMPLANTACAO_TEST_DATABASE_URL;

describe.skipIf(!URL)("importador contra o banco (idempotência)", () => {
  const db = new PrismaClient({ datasources: { db: { url: URL } } });
  let empresaId = "";

  const csvs: Record<string, string> = {
    FORNECEDOR: "Codigo;Razao Social;CNPJ\nF1;FORNECEDOR TESTE LTDA;11.222.333/0001-81\n",
    PRODUTO:
      "Codigo;Descricao;Cod Fabricante;NCM;Marca;Preco Venda;Custo;Unidade\n" +
      "T1;PAST FREIO DIANT SPRINTER 415 13/;N-1418;87083090;COBREQ;189,90;98,50;JG\n" +
      "T2;AMORT DIANT DUCATO 2.3 10/;GP32945;;COFAP;412,00;250,00;UN\n",
    ESTOQUE: "Codigo;Deposito;Quantidade\nT1;Loja;4\nT2;Loja;2\nT2;Galpão Teste;1\n",
    CLIENTE:
      "Codigo;Nome;CPF/CNPJ;Celular\nC1;OFICINA TESTE;01.222.333/0001-28;11999990000\nC2;CLIENTE TESTE PF;529.982.247-25;\nC3;MESMO DOC;52998224725;\n",
    CONTA_RECEBER:
      "Titulo;Codigo Cliente;Vencimento;Saldo;Forma\n1;C1;10/12/2026;300,00;Carteira\n2;C2;10/01/2027;99,99;Boleto\n",
  };

  async function rodar(entidade: Entidade, simular = false) {
    const csv = lerCsv(csvs[entidade]);
    return importar(db, {
      empresaId,
      entidade,
      registros: aplicarMapa(entidade, csv, sugerirMapa(entidade, csv.cabecalhos)),
      simular,
      origem: "CSV",
    });
  }

  beforeAll(async () => {
    const e = await db.empresa.create({
      data: { razaoSocial: "EMPRESA TESTE IMPLANTACAO", cnpj: `9${Date.now()}`.slice(0, 14) },
    });
    empresaId = e.id;
    await db.deposito.create({ data: { empresaId, nome: "Loja" } });
  });

  afterAll(async () => {
    const prods = await db.produto.findMany({ where: { empresaId }, select: { id: true } });
    await db.movimentoEstoque.deleteMany({ where: { produtoId: { in: prods.map((p) => p.id) } } });
    await db.contaReceber.deleteMany({ where: { empresaId } });
    await db.empresa.delete({ where: { id: empresaId } });
    await db.$disconnect();
  });

  it("simulação não grava nada", async () => {
    const r = await rodar("PRODUTO", true);
    expect(r.plano.criar).toBe(2);
    expect(await db.produto.count({ where: { empresaId } })).toBe(0);
  });

  it("primeira execução cria e a conferência bate", async () => {
    const ordem: Entidade[] = ["FORNECEDOR", "PRODUTO", "ESTOQUE", "CLIENTE", "CONTA_RECEBER"];
    for (const e of ordem) {
      const r = await rodar(e);
      expect(r.status, e).toBe("APLICADO");
      expect(r.bate, `${e}: ${r.diferencas.join("; ")}`).toBe(true);
    }
    const est = await rodar("ESTOQUE", true);
    expect(est.conferencia.totais.quantidade).toBe("7.000");
    // 4 × 98,50 + 3 × 250,00 = 1.144,00
    expect(est.conferencia.totais.valorCustoCentavos).toBe(114400);
    const cliente = await db.cliente.findFirst({ where: { empresaId, cpfCnpj: "01222333000128" } });
    expect(cliente!.saldoDevedor.toString()).toBe("300");
    expect(await db.cliente.count({ where: { empresaId } })).toBe(2); // C3 unificado com C2
  });

  it("segunda execução não muda nada (idempotente)", async () => {
    const antes = {
      produtos: await db.produto.count({ where: { empresaId } }),
      movs: await db.movimentoEstoque.count({ where: { produto: { empresaId } } }),
      contas: await db.contaReceber.count({ where: { empresaId } }),
      clientes: await db.cliente.count({ where: { empresaId } }),
    };
    for (const e of ["FORNECEDOR", "PRODUTO", "ESTOQUE", "CLIENTE", "CONTA_RECEBER"] as Entidade[]) {
      const r = await rodar(e);
      expect(r.plano.criar + r.plano.atualizar, e).toBe(0);
      expect(r.bate, e).toBe(true);
    }
    expect({
      produtos: await db.produto.count({ where: { empresaId } }),
      movs: await db.movimentoEstoque.count({ where: { produto: { empresaId } } }),
      contas: await db.contaReceber.count({ where: { empresaId } }),
      clientes: await db.cliente.count({ where: { empresaId } }),
    }).toEqual(antes);
    expect(antes.movs).toBe(3);
    const cliente = await db.cliente.findFirst({ where: { empresaId, cpfCnpj: "01222333000128" } });
    expect(cliente!.saldoDevedor.toString()).toBe("300");
  });

  it("saldo diferente na origem gera só a diferença no kardex, com auditoria", async () => {
    csvs.ESTOQUE = "Codigo;Deposito;Quantidade\nT1;Loja;6\nT2;Loja;2\nT2;Galpão Teste;1\n";
    const r = await rodar("ESTOQUE");
    expect(r.plano.atualizar).toBe(1);
    const t1 = await db.produto.findFirst({ where: { empresaId, sku: "T1" }, select: { id: true } });
    const movs = await db.movimentoEstoque.findMany({ where: { produtoId: t1!.id }, orderBy: { criadoEm: "asc" } });
    expect(movs.map((m) => [m.tipo, m.quantidade.toString(), m.origemTipo])).toEqual([
      ["AJUSTE_POSITIVO", "4", "SALDO_INICIAL"],
      ["AJUSTE_POSITIVO", "2", "SALDO_INICIAL"],
    ]);
    const log = await db.logAuditoria.findFirst({
      where: { acao: "ESTOQUE_SALDO_INICIAL", entidadeId: { startsWith: t1!.id } },
      orderBy: { criadoEm: "desc" },
    });
    expect((log!.dadosAntes as { quantidade: string }).quantidade).toBe("4");
    expect((log!.dadosDepois as { quantidade: string }).quantidade).toBe("6");
  });

  it("produto com venda no ERP não tem o saldo sobrescrito", async () => {
    const t2 = await db.produto.findFirst({ where: { empresaId, sku: "T2" }, select: { id: true } });
    const loja = await db.deposito.findFirst({ where: { empresaId, nome: "Loja" } });
    await db.movimentoEstoque.create({
      data: { produtoId: t2!.id, depositoId: loja!.id, tipo: "SAIDA", quantidade: 1, origemTipo: "VENDA" },
    });
    csvs.ESTOQUE = "Codigo;Deposito;Quantidade\nT2;Loja;9\n";
    const r = await rodar("ESTOQUE");
    expect(r.plano.bloqueados).toBe(1);
    expect(r.bate).toBe(false);
    const saldo = await db.estoqueDeposito.findFirst({ where: { produtoId: t2!.id, depositoId: loja!.id } });
    expect(saldo!.quantidade.toString()).toBe("2");
  });
});
