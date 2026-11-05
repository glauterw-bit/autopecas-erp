// Contra um Postgres com as migrações aplicadas. Roda só com
// LGPD_TEST_DATABASE_URL (nunca aponte para produção):
//   LGPD_TEST_DATABASE_URL=postgresql://localhost:5432/autopecas_erp_r4lgpd npm test
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import { PrismaClient } from "@prisma/client";
import { entradasExportacao } from "./exportar-empresa";
import { gerarZip } from "./zip";
import { anonimizarCliente, exportarDadosDoCliente, NOME_ANONIMIZADO } from "./titular";
import { excluirDadosDaEmpresa } from "./excluir-empresa";
import { aceitePendente, registrarAceite } from "../legal/aceite";
import { TERMOS_VERSAO } from "../legal/versao";
import { ApiError } from "../auth/guard";
import { criarEmpresaComAdmin } from "../empresas/criar-empresa";

const URL = process.env.LGPD_TEST_DATABASE_URL;

async function lerZip(db: PrismaClient, empresaId: string): Promise<Record<string, string>> {
  const partes: Buffer[] = [];
  for await (const p of gerarZip(entradasExportacao(db, empresaId))) partes.push(p);
  const zip = Buffer.concat(partes);
  const fim = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const total = zip.readUInt16LE(fim + 10);
  let p = zip.readUInt32LE(fim + 16);
  const out: Record<string, string> = {};
  for (let i = 0; i < total; i++) {
    const comp = zip.readUInt32LE(p + 20);
    const nomeLen = zip.readUInt16LE(p + 28);
    const local = zip.readUInt32LE(p + 42);
    const extraLocal = zip.readUInt16LE(local + 28);
    const ini = local + 30 + nomeLen + extraLocal;
    const nome = zip.subarray(p + 46, p + 46 + nomeLen).toString("utf8");
    out[nome] = inflateRawSync(zip.subarray(ini, ini + comp)).toString("utf8");
    p += 46 + nomeLen + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
  }
  return out;
}

describe.skipIf(!URL)("LGPD contra o banco", () => {
  const db = URL
    ? new PrismaClient({ datasources: { db: { url: URL } } })
    : (undefined as unknown as PrismaClient);
  const sufixo = `${Date.now()}`;
  const A = { id: "", usuario: "", cliente: "", clienteAberto: "", cnpj: `8${sufixo}`.slice(0, 14) };
  const B = { id: "", usuario: "", cliente: "", cnpj: `7${sufixo}`.slice(0, 14) };

  async function criarEmpresa(rotulo: string, cnpj: string) {
    // Como no mundo real: empresa, filial, depósito, ADMIN e assinatura nascem juntos.
    const { empresa: e, usuario: u } = await criarEmpresaComAdmin(db, {
      razaoSocial: `EMPRESA ${rotulo} ${sufixo}`, cnpj, adminNome: `Admin ${rotulo}`,
      adminEmail: `${rotulo.toLowerCase()}-${sufixo}@teste.com`.toLowerCase(), adminSenha: "senha-de-teste-123", assinatura: { tipo: "TRIAL" },
    });
    const dep = await db.deposito.findFirstOrThrow({ where: { empresaId: e.id } });
    await db.consumoNotasMes.create({ data: { empresaId: e.id, mes: "2026-11", notas: 3 } });
    const prod = await db.produto.create({ data: { empresaId: e.id, sku: `SKU-${rotulo}`, nome: `Peça ${rotulo}` } });
    await db.estoqueDeposito.create({ data: { produtoId: prod.id, depositoId: dep.id, quantidade: 5 } });
    await db.movimentoEstoque.create({ data: { produtoId: prod.id, depositoId: dep.id, tipo: "ENTRADA", quantidade: 5 } });
    const cli = await db.cliente.create({
      data: { empresaId: e.id, nome: `Cliente ${rotulo}`, cpfCnpj: rotulo === "A" ? "52998224725" : "11144477735", email: `c${rotulo}@x.com`, telefone: "11999990000" },
    });
    await db.veiculoCliente.create({ data: { clienteId: cli.id, placa: "ABC1D23" } });
    await db.fornecedor.create({ data: { empresaId: e.id, cnpjCpf: `1${rotulo}${sufixo}`.slice(0, 14), razaoSocial: `Forn ${rotulo}` } });
    const venda = await db.venda.create({
      data: { empresaId: e.id, numero: 1, status: "FATURADA", clienteId: cli.id, valorTotal: 10, observacoes: `venda-${rotulo}` },
    });
    await db.itemVenda.create({
      data: { vendaId: venda.id, produtoId: prod.id, quantidade: 1, precoUnitario: 10, custoUnitario: 5, total: 10 },
    });
    await db.contaReceber.create({
      data: { empresaId: e.id, clienteId: cli.id, vendaId: venda.id, descricao: `titulo-${rotulo}`, formaPagamento: "DINHEIRO", dataVencimento: new Date(), valor: 10, status: "PAGO" },
    });
    await db.contaPagar.create({ data: { empresaId: e.id, descricao: `pagar-${rotulo}`, dataVencimento: new Date(), valor: 3 } });
    await db.notaFiscal.create({
      data: {
        empresaId: e.id, modelo: "NFCE_65", serie: "1", numero: 1, status: "AUTORIZADA", naturezaOperacao: "Venda",
        valorProdutos: 10, valorTotal: 10, chaveAcesso: `CHAVE${rotulo}${sufixo}`, xmlAutorizado: `<nfe>xml-${rotulo}</nfe>`, clienteId: cli.id,
      },
    });
    await db.lancamentoContabil.create({
      data: { empresaId: e.id, data: new Date(), historico: `lanc-${rotulo}`, origemTipo: "TESTE", origemId: `o-${rotulo}` },
    });
    return { e, u, cli };
  }

  beforeAll(async () => {
    const a = await criarEmpresa("A", A.cnpj);
    A.id = a.e.id; A.usuario = a.u.id; A.cliente = a.cli.id;
    const b = await criarEmpresa("B", B.cnpj);
    B.id = b.e.id; B.usuario = b.u.id; B.cliente = b.cli.id;
    const aberto = await db.cliente.create({ data: { empresaId: A.id, nome: "Devedor", cpfCnpj: "39053344705", email: "dev@x.com" } });
    A.clienteAberto = aberto.id;
    await db.contaReceber.create({
      data: { empresaId: A.id, clienteId: aberto.id, descricao: "em aberto", formaPagamento: "BOLETO", dataVencimento: new Date(), valor: 50, status: "ABERTO" },
    });
  });

  afterAll(async () => {
    for (const id of [A.id, B.id]) {
      if (!id) continue;
      await db.notaFiscal.deleteMany({ where: { empresaId: id } });
      await db.lancamentoContabil.deleteMany({ where: { empresaId: id } });
      await db.movimentoEstoque.deleteMany({ where: { produto: { empresaId: id } } });
      await db.venda.deleteMany({ where: { empresaId: id } });
      await db.aceiteTermos.deleteMany({ where: { empresaId: id } });
      await db.logAuditoria.deleteMany({ where: { usuario: { empresaId: id } } });
      await db.empresa.delete({ where: { id } }).catch(() => undefined);
    }
    await db.$disconnect();
  });

  describe("anonimização", () => {
    it("bloqueia se houver conta a receber em aberto, sem mexer em nada", async () => {
      await expect(anonimizarCliente(db, A.id, A.clienteAberto, A.usuario)).rejects.toMatchObject({ status: 409 });
      const c = await db.cliente.findUniqueOrThrow({ where: { id: A.clienteAberto } });
      expect(c.nome).toBe("Devedor");
      expect(c.cpfCnpj).toBe("39053344705");
    });

    it("não deixa uma empresa mexer em cliente de outra", async () => {
      await expect(anonimizarCliente(db, B.id, A.cliente, B.usuario)).rejects.toBeInstanceOf(ApiError);
      const c = await db.cliente.findUniqueOrThrow({ where: { id: A.cliente } });
      expect(c.nome).toBe("Cliente A");
    });

    it("apaga os dados pessoais, mantém vendas e notas e grava auditoria sem o documento", async () => {
      const r = await anonimizarCliente(db, A.id, A.cliente, A.usuario);
      expect(r.jaAnonimizado).toBe(false);
      const c = await db.cliente.findUniqueOrThrow({ where: { id: A.cliente } });
      expect(c).toMatchObject({ nome: NOME_ANONIMIZADO, cpfCnpj: null, email: null, telefone: null });
      expect(await db.veiculoCliente.count({ where: { clienteId: A.cliente } })).toBe(0);
      expect(await db.venda.count({ where: { clienteId: A.cliente } })).toBe(1);
      expect(await db.notaFiscal.count({ where: { empresaId: A.id } })).toBe(1);
      const log = await db.logAuditoria.findFirstOrThrow({ where: { acao: "LGPD_ANONIMIZAR_CLIENTE", entidadeId: A.cliente } });
      expect(JSON.stringify(log.dadosAntes)).not.toContain("52998224725");
      // o log guarda só o id: nem o nome da pessoa
      expect(JSON.stringify(log)).not.toContain("Cliente A");
      // cliente B intacto
      expect((await db.cliente.findUniqueOrThrow({ where: { id: B.cliente } })).nome).toBe("Cliente B");
      // repetir é inofensivo
      expect((await anonimizarCliente(db, A.id, A.cliente, A.usuario)).jaAnonimizado).toBe(true);
    });

    it("exportar o titular não inclui senha e só enxerga a própria empresa", async () => {
      const d = await exportarDadosDoCliente(db, B.id, B.cliente, B.usuario);
      expect(d.cadastro.nome).toBe("Cliente B");
      expect(JSON.stringify(d)).not.toContain("senhaHashB2B");
      expect(JSON.stringify(d)).not.toContain("venda-A");
      await expect(exportarDadosDoCliente(db, B.id, A.cliente, B.usuario)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("exportação da empresa", () => {
    it("traz os dados da empresa e nenhum dado da outra", async () => {
      const zip = await lerZip(db, B.id);
      expect(Object.keys(zip)).toEqual(
        expect.arrayContaining([
          "produtos.csv", "aplicacoes-veiculares.csv", "estoque.csv", "clientes.csv", "fornecedores.csv", "vendas.csv",
          "itens-de-venda.csv", "contas-a-receber.csv", "contas-a-pagar.csv", "kardex.csv", "LEIAME.txt",
          `xml/CHAVEB${sufixo}.xml`,
        ]),
      );
      const tudo = Object.values(zip).join("\n");
      expect(tudo).toContain("SKU-B");
      expect(tudo).toContain("venda-B");
      expect(tudo).toContain("titulo-B");
      expect(tudo).toContain("xml-B");
      for (const marca of ["SKU-A", "venda-A", "titulo-A", "pagar-A", "xml-A", "Forn A", "Cliente A", "dev@x.com", "Peça A"]) {
        expect(tudo).not.toContain(marca);
      }
      expect(Object.keys(zip).some((n) => n.includes(`CHAVEA`))).toBe(false);
    });

    it("lê em lotes por cursor: 4.500 produtos saem completos, sem repetir nem perder", async () => {
      await db.produto.createMany({
        data: Array.from({ length: 4500 }, (_, i) => ({ empresaId: B.id, sku: `LOTE-${String(i).padStart(5, "0")}`, nome: `Lote ${i}` })),
      });
      try {
        const zip = await lerZip(db, B.id);
        const linhas = zip["produtos.csv"].split("\r\n").filter(Boolean);
        expect(linhas).toHaveLength(1 + 1 + 4500); // cabeçalho + SKU-B + lote
        expect(new Set(linhas.map((l) => l.split(";")[2])).size).toBe(linhas.length); // sem repetição
        expect(zip["LEIAME.txt"]).toContain("produtos: 4501");
      } finally {
        await db.produto.deleteMany({ where: { empresaId: B.id, sku: { startsWith: "LOTE-" } } });
      }
    });

    it("não exporta hash de senha do portal B2B", async () => {
      await db.cliente.update({ where: { id: B.cliente }, data: { senhaHashB2B: "HASH-SECRETO-B2B" } });
      const zip = await lerZip(db, B.id);
      expect(Object.values(zip).join("\n")).not.toContain("HASH-SECRETO-B2B");
    });
  });

  describe("aceite dos termos", () => {
    it("fica pendente até aceitar e o registro guarda versão, IP e navegador", async () => {
      expect(await aceitePendente(db, B.usuario)).toBe(true);
      await registrarAceite(db, { usuarioId: B.usuario, empresaId: B.id, ip: "203.0.113.9", userAgent: "teste/1.0" });
      await registrarAceite(db, { usuarioId: B.usuario, empresaId: B.id, ip: "203.0.113.9", userAgent: "teste/1.0" });
      expect(await aceitePendente(db, B.usuario)).toBe(false);
      const linhas = await db.aceiteTermos.findMany({ where: { usuarioId: B.usuario } });
      expect(linhas.map((l) => l.documento).sort()).toEqual(["DPA", "PRIVACIDADE", "TERMOS"]);
      expect(linhas[0]).toMatchObject({ versao: TERMOS_VERSAO, ip: "203.0.113.9", userAgent: "teste/1.0", empresaId: B.id });
    });

    it("versão nova volta a ficar pendente", async () => {
      expect(await aceitePendente(db, B.usuario, "2099-01-01")).toBe(true);
    });
  });

  describe("exclusão da empresa", () => {
    it("simulação conta e não apaga nada", async () => {
      const r = await excluirDadosDaEmpresa(db, B.id, { simular: true });
      expect(r.simulacao).toBe(true);
      expect(r.apagados.produtos).toBe(1);
      expect(r.apagados.clientes).toBe(1);
      expect(await db.produto.count({ where: { empresaId: B.id } })).toBe(1);
      expect(await db.usuario.count({ where: { empresaId: B.id } })).toBe(1);
    });

    it("apaga o operacional, guarda nota e lançamento e não toca em outra empresa", async () => {
      const antesA = await db.produto.count({ where: { empresaId: A.id } });
      const r = await excluirDadosDaEmpresa(db, B.id, { simular: false });
      expect(r.mantidos.notas_fiscais).toBe(1);
      expect(r.mantidos.lancamentos_contabeis).toBe(1);
      expect(r.mantidos.assinaturas).toBe(1);
      expect(r.mantidos.consumo_notas_mes).toBe(1);
      expect(await db.assinatura.count({ where: { empresaId: B.id } })).toBe(1);
      for (const [nome, n] of [
        ["produtos", await db.produto.count({ where: { empresaId: B.id } })],
        ["clientes", await db.cliente.count({ where: { empresaId: B.id } })],
        ["vendas", await db.venda.count({ where: { empresaId: B.id } })],
        ["usuarios", await db.usuario.count({ where: { empresaId: B.id } })],
        ["contas_receber", await db.contaReceber.count({ where: { empresaId: B.id } })],
      ] as const) expect([nome, n]).toEqual([nome, 0]);
      const nota = await db.notaFiscal.findFirstOrThrow({ where: { empresaId: B.id } });
      expect(nota.xmlAutorizado).toContain("xml-B");
      const emp = await db.empresa.findUniqueOrThrow({ where: { id: B.id } });
      expect(emp.email).toBeNull();
      expect(emp.cnpj).toBe(B.cnpj);
      expect(await db.produto.count({ where: { empresaId: A.id } })).toBe(antesA);
      expect(await db.aceiteTermos.count({ where: { empresaId: B.id } })).toBeGreaterThan(0);
    });

    it("recusa empresa que não existe", async () => {
      await expect(excluirDadosDaEmpresa(db, "nao-existe", { simular: true })).rejects.toThrow(/não encontrada/);
    });
  });
});
