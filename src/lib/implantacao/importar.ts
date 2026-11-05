// Importador idempotente
// ======================
// Mesmo arquivo rodado duas vezes dá o mesmo resultado: produto pela chave
// (empresa, código interno), fornecedor pelo CNPJ, cliente e título a receber
// pela tabela importacao_chaves (chave do sistema antigo → registro daqui).
//
// Estoque não "soma": a importação leva o saldo do depósito até o número da
// origem, gravando a diferença no kardex (MovimentoEstoque com origemTipo
// SALDO_INICIAL) e no LogAuditoria com antes e depois. Na segunda execução a
// diferença é zero e nada é gravado.
//
// Proteção depois da virada: produto que já teve movimento no ERP (venda,
// compra, inventário) não tem saldo nem custo médio sobrescritos pela origem;
// título que já foi recebido aqui não é alterado. Aparece como "bloqueado".
//
// Modo simulação: faz todas as leituras e o plano, mas não grava nada além do
// registro do lote (para baixar o relatório).
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Entidade, RegistroBruto } from "./tipos";
import { erroSeguro } from "../log-seguro";
import {
  validar,
  type ClienteDados,
  type ContaReceberDados,
  type DadosPorEntidade,
  type EstoqueDados,
  type FornecedorDados,
  type PrecoDados,
  type ProdutoDados,
  type RegistroValidado,
} from "./validar";
import {
  compararTotais,
  conferirOrigem,
  type Problema,
  type ResultadoImportacao,
  type Totais,
} from "./conferencia";
import { Decimal, type Dec, mascararDoc, paraCentavos } from "./normalizar";

export const ORIGEM_SALDO_INICIAL = "SALDO_INICIAL";
const LOTE = 500;

type Tx = Prisma.TransactionClient;
type Op = (tx: Tx) => Promise<unknown>;

export type OpcoesImportacao = {
  empresaId: string;
  usuarioId?: string | null;
  entidade: Entidade;
  registros: RegistroBruto[];
  simular: boolean;
  origem: "CSV" | "RADAR";
  arquivoNome?: string;
  depositoPadrao?: string; // nome do depósito para linhas sem depósito
  skusPrevistos?: Set<string>; // simulação encadeada: produtos que a etapa anterior criaria
  detalhesExtras?: Record<string, number | string>;
};

type Ctx = {
  db: PrismaClient;
  empresaId: string;
  usuarioId: string | null;
  loteId: string;
  simular: boolean;
  plano: ResultadoImportacao["plano"];
  problemas: Problema[];
  novosDepositos: string[];
  auditoria: Prisma.LogAuditoriaCreateManyInput[];
  custoPorSku: Map<string, Dec>;
  depositoPadraoNome: string;
  // para conferir o destino
  paresEstoque: { produtoId: string; depositoId: string; zero: boolean }[];
  opcoes: OpcoesImportacao;
};

function pedacos<T>(xs: T[], n = LOTE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

function chaveExibicao(entidade: Entidade, chave: string): string {
  if (entidade === "FORNECEDOR") return mascararDoc(chave);
  if (entidade === "CLIENTE" && chave.startsWith("D:")) return `D:${mascararDoc(chave.slice(2))}`;
  return chave;
}

function falhar<T>(ctx: Ctx, r: RegistroValidado<T>, entidade: Entidade, msg: string) {
  r.erros.push(msg);
  r.dados = null;
  ctx.plano.comErro++;
  ctx.problemas.push({ linha: r.linha, ref: r.ref, chave: chaveExibicao(entidade, r.chave), tipo: "erro", mensagem: msg });
}

function avisar<T>(ctx: Ctx, r: RegistroValidado<T>, entidade: Entidade, msg: string) {
  r.avisos.push(msg);
  ctx.problemas.push({ linha: r.linha, ref: r.ref, chave: chaveExibicao(entidade, r.chave), tipo: "aviso", mensagem: msg });
}

async function executarOps(ctx: Ctx, ops: Op[]) {
  if (ctx.simular || ops.length === 0) {
    if (ctx.simular) ctx.auditoria = [];
    return;
  }
  const auditoria = ctx.auditoria;
  ctx.auditoria = [];
  await ctx.db.$transaction(
    async (tx) => {
      for (const op of ops) await op(tx);
      if (auditoria.length) await tx.logAuditoria.createMany({ data: auditoria });
    },
    { timeout: 180_000, maxWait: 30_000 },
  );
}

function auditar(ctx: Ctx, acao: string, entidade: string, entidadeId: string, antes: unknown, depois: unknown) {
  ctx.auditoria.push({
    usuarioId: ctx.usuarioId,
    acao,
    entidade,
    entidadeId,
    dadosAntes: JSON.parse(JSON.stringify(antes)) as Prisma.InputJsonValue,
    dadosDepois: JSON.parse(JSON.stringify({ ...(depois as object), loteImplantacao: ctx.loteId })) as Prisma.InputJsonValue,
  });
}

// Compara só os campos que vieram preenchidos na origem (vazio não apaga dado daqui).
type Valor = string | number | boolean | Dec | Date | null | undefined;
function iguais(a: Valor, b: Valor): boolean {
  if (a === undefined || a === null) return b === undefined || b === null;
  if (b === undefined || b === null) return false;
  if (Decimal.isDecimal(a) || Decimal.isDecimal(b)) return new Decimal(a as Dec).eq(new Decimal(b as Dec));
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}
function diferencas<T extends Record<string, Valor>>(atual: Record<string, Valor>, novo: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(novo)) {
    if (v === undefined) continue;
    if (!iguais(atual[k], v)) (out as Record<string, Valor>)[k] = v;
  }
  return out;
}

// Produtos que já tiveram movimento no ERP fora da implantação.
async function produtosMovimentados(db: PrismaClient, produtoIds: string[]): Promise<Set<string>> {
  if (!produtoIds.length) return new Set();
  const movs = await db.movimentoEstoque.findMany({
    where: {
      produtoId: { in: produtoIds },
      OR: [{ origemTipo: null }, { origemTipo: { not: ORIGEM_SALDO_INICIAL } }],
    },
    distinct: ["produtoId"],
    select: { produtoId: true },
  });
  return new Set(movs.map((m) => m.produtoId));
}

// ---------------------------------------------------------------------------
// PRODUTO
// ---------------------------------------------------------------------------
const CAMPOS_PRECO = ["precoVenda", "precoMinimo", "custoMedio"] as const;

async function importarProdutos(ctx: Ctx, regs: RegistroValidado<ProdutoDados>[]) {
  const marcas = new Map<string, string>();
  for (const m of await ctx.db.marca.findMany({ select: { id: true, nome: true } }))
    marcas.set(m.nome.toUpperCase(), m.id);

  async function marcaId(nome?: string): Promise<string | undefined> {
    if (!nome) return undefined;
    const k = nome.toUpperCase();
    const ja = marcas.get(k);
    if (ja) return ja;
    if (ctx.simular) {
      marcas.set(k, `nova:${k}`);
      return `nova:${k}`;
    }
    // Marca é cadastro global (compartilhado); upsert pelo nome único.
    const m = await ctx.db.marca.upsert({ where: { nome }, create: { nome }, update: {}, select: { id: true } });
    marcas.set(k, m.id);
    return m.id;
  }

  for (const grupo of pedacos(regs)) {
    const existentes = await ctx.db.produto.findMany({
      where: { empresaId: ctx.empresaId, sku: { in: grupo.map((r) => r.dados!.sku) } },
    });
    const porSku = new Map(existentes.map((p) => [p.sku, p]));
    const movidos = await produtosMovimentados(ctx.db, existentes.map((p) => p.id));
    const novos: Prisma.ProdutoCreateManyInput[] = [];
    const ops: Op[] = [];

    for (const r of grupo) {
      const d = r.dados!;
      const campos = {
        nome: d.nome,
        descricao: d.descricao,
        codigoFabricante: d.codigoFabricante,
        codigoOem: d.codigoOem,
        codigoBarras: d.codigoBarras,
        ncm: d.ncm,
        cest: d.cest,
        marcaId: await marcaId(d.marca),
        unidade: d.unidade,
        precoVenda: d.precoVenda,
        precoMinimo: d.precoMinimo,
        custoMedio: d.custo,
        ativo: d.ativo,
        pesoKg: d.pesoKg,
        localizacao: d.localizacao,
        estoqueMinimo: d.estoqueMinimo,
      };
      const ex = porSku.get(d.sku);
      if (!ex) {
        ctx.plano.criar++;
        if (!ctx.simular)
          novos.push({
            empresaId: ctx.empresaId,
            sku: d.sku,
            ...Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== undefined)),
            custoUltimaCompra: d.custo,
          } as Prisma.ProdutoCreateManyInput);
        continue;
      }
      const dif = diferencas(ex as unknown as Record<string, Valor>, campos);
      if (dif.custoMedio !== undefined && movidos.has(ex.id)) {
        delete dif.custoMedio;
        avisar(ctx, r, "PRODUTO", "Produto já movimentado no ERP: custo médio daqui mantido");
      }
      if (Object.keys(dif).length === 0) {
        ctx.plano.iguais++;
        continue;
      }
      ctx.plano.atualizar++;
      const mudouPreco = CAMPOS_PRECO.filter((k) => k in dif);
      if (mudouPreco.length)
        auditar(
          ctx,
          "PRECO_ALTERADO_IMPLANTACAO",
          "Produto",
          ex.id,
          Object.fromEntries(mudouPreco.map((k) => [k, ex[k]])),
          Object.fromEntries(mudouPreco.map((k) => [k, dif[k]])),
        );
      ops.push((tx) => tx.produto.update({ where: { id: ex.id }, data: dif as Prisma.ProdutoUpdateInput }));
    }
    if (novos.length) ops.unshift((tx) => tx.produto.createMany({ data: novos, skipDuplicates: true }));
    await executarOps(ctx, ops);
  }
}

// ---------------------------------------------------------------------------
// PRECO (só atualiza produto existente)
// ---------------------------------------------------------------------------
async function importarPrecos(ctx: Ctx, regs: RegistroValidado<PrecoDados>[]) {
  for (const grupo of pedacos(regs)) {
    const existentes = await ctx.db.produto.findMany({
      where: { empresaId: ctx.empresaId, sku: { in: grupo.map((r) => r.dados!.sku) } },
      select: { id: true, sku: true, precoVenda: true, precoMinimo: true, custoMedio: true },
    });
    const porSku = new Map(existentes.map((p) => [p.sku, p]));
    const movidos = await produtosMovimentados(ctx.db, existentes.map((p) => p.id));
    const ops: Op[] = [];
    for (const r of grupo) {
      const d = r.dados!;
      const ex = porSku.get(d.sku);
      if (!ex) {
        if (ctx.opcoes.skusPrevistos?.has(d.sku)) {
          ctx.plano.atualizar++;
          continue;
        }
        falhar(ctx, r, "PRECO", `Produto ${d.sku} não cadastrado: importe os produtos antes`);
        continue;
      }
      const dif = diferencas(ex as unknown as Record<string, Valor>, {
        precoVenda: d.precoVenda,
        precoMinimo: d.precoMinimo,
        custoMedio: d.custo,
      });
      if (dif.custoMedio !== undefined && movidos.has(ex.id)) {
        delete dif.custoMedio;
        avisar(ctx, r, "PRECO", "Produto já movimentado no ERP: custo médio daqui mantido");
      }
      if (Object.keys(dif).length === 0) {
        ctx.plano.iguais++;
        continue;
      }
      ctx.plano.atualizar++;
      auditar(
        ctx,
        "PRECO_ALTERADO_IMPLANTACAO",
        "Produto",
        ex.id,
        Object.fromEntries(Object.keys(dif).map((k) => [k, ex[k as keyof typeof ex]])),
        dif,
      );
      ops.push((tx) => tx.produto.update({ where: { id: ex.id }, data: dif as Prisma.ProdutoUpdateInput }));
    }
    await executarOps(ctx, ops);
  }
}

// ---------------------------------------------------------------------------
// ESTOQUE (saldo por depósito via kardex)
// ---------------------------------------------------------------------------
async function importarEstoque(ctx: Ctx, regs: RegistroValidado<EstoqueDados>[]) {
  const deps = await ctx.db.deposito.findMany({
    where: { empresaId: ctx.empresaId },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, tipo: true },
  });
  const porNome = new Map(deps.map((d) => [d.nome.trim().toUpperCase(), d.id]));
  ctx.depositoPadraoNome =
    ctx.opcoes.depositoPadrao?.trim() || deps.find((d) => d.tipo === "LOJA")?.nome || deps[0]?.nome || "Loja";
  const filial = await ctx.db.filial.findFirst({ where: { empresaId: ctx.empresaId }, select: { id: true } });

  async function depositoId(nome: string): Promise<string> {
    const k = nome.trim().toUpperCase();
    const ja = porNome.get(k);
    if (ja) return ja;
    ctx.novosDepositos.push(nome);
    if (ctx.simular) {
      porNome.set(k, `novo:${k}`);
      return `novo:${k}`;
    }
    const d = await ctx.db.deposito.create({
      data: { empresaId: ctx.empresaId, nome: nome.trim(), filialId: filial?.id ?? null, tipo: "LOJA" },
      select: { id: true },
    });
    porNome.set(k, d.id);
    return d.id;
  }

  for (const grupo of pedacos(regs)) {
    const produtos = await ctx.db.produto.findMany({
      where: { empresaId: ctx.empresaId, sku: { in: [...new Set(grupo.map((r) => r.dados!.sku))] } },
      select: { id: true, sku: true, custoMedio: true },
    });
    const porSku = new Map(produtos.map((p) => [p.sku, p]));
    const saldos = await ctx.db.estoqueDeposito.findMany({
      where: { produtoId: { in: produtos.map((p) => p.id) } },
      select: { id: true, produtoId: true, depositoId: true, quantidade: true },
    });
    const saldoDe = new Map(saldos.map((s) => [`${s.produtoId}@${s.depositoId}`, s]));
    const movidos = await produtosMovimentados(ctx.db, produtos.map((p) => p.id));
    const custoAtualizado = new Set<string>();
    const ops: Op[] = [];

    for (const r of grupo) {
      const d = r.dados!;
      const depNome = d.deposito ?? ctx.depositoPadraoNome;
      const depId = await depositoId(depNome);
      const p = porSku.get(d.sku);
      if (!p) {
        if (ctx.opcoes.skusPrevistos?.has(d.sku)) {
          if (d.custo) ctx.custoPorSku.set(d.sku, d.custo);
          if (d.quantidade.isZero()) ctx.plano.iguais++;
          else ctx.plano.criar++;
          continue;
        }
        falhar(ctx, r, "ESTOQUE", `Produto ${d.sku} não cadastrado: importe os produtos antes`);
        continue;
      }
      ctx.paresEstoque.push({ produtoId: p.id, depositoId: depId, zero: d.quantidade.isZero() });
      ctx.custoPorSku.set(d.sku, d.custo ?? p.custoMedio);

      // custo médio vazio + custo na planilha de estoque = usa o da planilha
      if (d.custo && d.custo.gt(0) && p.custoMedio.isZero() && !movidos.has(p.id) && !custoAtualizado.has(p.id)) {
        custoAtualizado.add(p.id);
        auditar(ctx, "PRECO_ALTERADO_IMPLANTACAO", "Produto", p.id, { custoMedio: p.custoMedio }, { custoMedio: d.custo });
        const custo = d.custo;
        ops.push((tx) => tx.produto.update({ where: { id: p.id }, data: { custoMedio: custo } }));
      }

      const atual = saldoDe.get(`${p.id}@${depId}`);
      const antes = atual?.quantidade ?? new Decimal(0);
      const diferenca = d.quantidade.sub(antes);
      if (diferenca.isZero()) {
        ctx.plano.iguais++;
        continue;
      }
      if (movidos.has(p.id)) {
        ctx.plano.bloqueados++;
        avisar(
          ctx,
          r,
          "ESTOQUE",
          `Produto já movimentado no ERP: saldo daqui (${antes.toString()}) mantido, origem diz ${d.quantidade.toString()}. Acerte por inventário.`,
        );
        continue;
      }
      if (atual) ctx.plano.atualizar++;
      else ctx.plano.criar++;
      const custoUnit = d.custo ?? p.custoMedio;
      auditar(
        ctx,
        "ESTOQUE_SALDO_INICIAL",
        "EstoqueDeposito",
        `${p.id}@${depId}`,
        { sku: d.sku, deposito: depNome, quantidade: antes },
        { sku: d.sku, deposito: depNome, quantidade: d.quantidade },
      );
      const qtd = d.quantidade;
      ops.push(async (tx) => {
        await tx.estoqueDeposito.upsert({
          where: { produtoId_depositoId: { produtoId: p.id, depositoId: depId } },
          create: { produtoId: p.id, depositoId: depId, quantidade: qtd },
          update: { quantidade: qtd },
        });
        await tx.movimentoEstoque.create({
          data: {
            produtoId: p.id,
            depositoId: depId,
            tipo: diferenca.gt(0) ? "AJUSTE_POSITIVO" : "AJUSTE_NEGATIVO",
            quantidade: diferenca.abs(),
            custoUnitario: custoUnit,
            documento: "IMPLANTACAO",
            origemTipo: ORIGEM_SALDO_INICIAL,
            origemId: ctx.loteId,
            observacao: `Saldo inicial da implantação: de ${antes.toString()} para ${qtd.toString()}`,
          },
        });
      });
    }
    await executarOps(ctx, ops);
  }
}

// ---------------------------------------------------------------------------
// Chaves de origem (cliente, título)
// ---------------------------------------------------------------------------
async function carregarChaves(ctx: Ctx, entidade: string, chaves: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const g of pedacos(chaves, 1000)) {
    const rows = await ctx.db.importacaoChave.findMany({
      where: { empresaId: ctx.empresaId, entidade, chave: { in: g } },
      select: { chave: true, entidadeId: true },
    });
    for (const r of rows) out.set(r.chave, r.entidadeId);
  }
  return out;
}

function gravarChave(ctx: Ctx, entidade: string, chave: string, entidadeId: string): Op {
  return (tx) =>
    tx.importacaoChave.upsert({
      where: { empresaId_entidade_chave: { empresaId: ctx.empresaId, entidade, chave } },
      create: { empresaId: ctx.empresaId, entidade, chave, entidadeId, loteId: ctx.loteId },
      update: { entidadeId, loteId: ctx.loteId },
    });
}

// ---------------------------------------------------------------------------
// CLIENTE
// ---------------------------------------------------------------------------
async function importarClientes(ctx: Ctx, regs: RegistroValidado<ClienteDados>[]) {
  const docNestaExecucao = new Map<string, string>(); // doc → id (ou "novo:chave" na simulação)
  for (const grupo of pedacos(regs)) {
    const mapeados = await carregarChaves(ctx, "CLIENTE", grupo.map((r) => r.chave));
    const docs = grupo.map((r) => r.dados!.cpfCnpj).filter((d): d is string => !!d);
    const ids = [...new Set(mapeados.values())];
    const existentes = await ctx.db.cliente.findMany({
      where: { empresaId: ctx.empresaId, OR: [{ id: { in: ids } }, { cpfCnpj: { in: docs } }] },
    });
    const porId = new Map(existentes.map((c) => [c.id, c]));
    const porDoc = new Map(existentes.filter((c) => c.cpfCnpj).map((c) => [c.cpfCnpj!, c]));
    const ops: Op[] = [];

    for (const r of grupo) {
      const d = r.dados!;
      const campos = {
        tipo: d.tipo,
        nome: d.nome,
        cpfCnpj: d.cpfCnpj,
        rgIe: d.rgIe,
        apelido: d.apelido,
        email: d.email,
        telefone: d.telefone,
        whatsapp: d.whatsapp,
        logradouro: d.logradouro,
        numero: d.numero,
        complemento: d.complemento,
        bairro: d.bairro,
        municipio: d.municipio,
        uf: d.uf,
        cep: d.cep,
        limiteCredito: d.limiteCredito,
        observacoes: d.observacoes,
      };
      let id = mapeados.get(r.chave);
      let ex = id ? porId.get(id) : undefined;
      if (id && !ex) id = undefined; // cliente apagado depois: recria
      let novaChave = false;

      // Mesmo CPF/CNPJ de um cliente já visto nesta execução: unifica sem aplicar os dados
      // desta linha (senão as duas linhas se sobrescreveriam a cada execução).
      const docJa = d.cpfCnpj ? docNestaExecucao.get(d.cpfCnpj) : undefined;
      if (docJa && (!id || docJa === id)) {
        avisar(ctx, r, "CLIENTE", "Mesmo CPF/CNPJ de outro cliente do arquivo: unificado no mesmo cadastro");
        ctx.plano.iguais++;
        if (!id) {
          const doc = d.cpfCnpj!;
          const chave = r.chave;
          ops.push(async (tx) => {
            const real = docNestaExecucao.get(doc);
            if (real && !real.startsWith("novo:")) await gravarChave(ctx, "CLIENTE", chave, real)(tx);
          });
        }
        continue;
      }

      if (!id && d.cpfCnpj) {
        const doBanco = porDoc.get(d.cpfCnpj);
        if (doBanco) {
          id = doBanco.id;
          ex = doBanco;
          novaChave = true;
        }
      }

      if (id && ex) {
        if (d.cpfCnpj && ex.cpfCnpj !== d.cpfCnpj && porDoc.has(d.cpfCnpj) && porDoc.get(d.cpfCnpj)!.id !== ex.id) {
          avisar(ctx, r, "CLIENTE", "CPF/CNPJ já pertence a outro cliente daqui: documento não alterado");
          delete (campos as Partial<typeof campos>).cpfCnpj;
        }
        if (d.cpfCnpj) docNestaExecucao.set(d.cpfCnpj, ex.id);
        const dif = diferencas(ex as unknown as Record<string, Valor>, campos);
        const exId = ex.id;
        if (novaChave) ops.push(gravarChave(ctx, "CLIENTE", r.chave, exId));
        if (Object.keys(dif).length === 0) {
          ctx.plano.iguais++;
          continue;
        }
        ctx.plano.atualizar++;
        ops.push((tx) => tx.cliente.update({ where: { id: exId }, data: dif as Prisma.ClienteUpdateInput }));
        continue;
      }

      ctx.plano.criar++;
      if (d.cpfCnpj) docNestaExecucao.set(d.cpfCnpj, `novo:${r.chave}`);
      const data = {
        empresaId: ctx.empresaId,
        ...(Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== undefined)) as typeof campos),
      };
      const chave = r.chave;
      const doc = d.cpfCnpj;
      ops.push(async (tx) => {
        const c = await tx.cliente.create({ data, select: { id: true } });
        if (doc) docNestaExecucao.set(doc, c.id);
        await gravarChave(ctx, "CLIENTE", chave, c.id)(tx);
      });
    }
    await executarOps(ctx, ops);
  }
}

// ---------------------------------------------------------------------------
// FORNECEDOR
// ---------------------------------------------------------------------------
async function importarFornecedores(ctx: Ctx, regs: RegistroValidado<FornecedorDados>[]) {
  for (const grupo of pedacos(regs)) {
    const existentes = await ctx.db.fornecedor.findMany({
      where: { empresaId: ctx.empresaId, cnpjCpf: { in: grupo.map((r) => r.dados!.cnpjCpf) } },
    });
    const porDoc = new Map(existentes.map((f) => [f.cnpjCpf, f]));
    const novos: Prisma.FornecedorCreateManyInput[] = [];
    const ops: Op[] = [];
    for (const r of grupo) {
      const d = r.dados!;
      const campos = {
        tipo: d.tipo,
        razaoSocial: d.razaoSocial,
        nomeFantasia: d.nomeFantasia,
        inscricaoEstadual: d.inscricaoEstadual,
        contatoNome: d.contatoNome,
        telefone: d.telefone,
        email: d.email,
        endereco: d.endereco,
        prazoEntregaDias: d.prazoEntregaDias,
        ativo: d.ativo,
      };
      const ex = porDoc.get(d.cnpjCpf);
      if (!ex) {
        ctx.plano.criar++;
        novos.push({
          empresaId: ctx.empresaId,
          cnpjCpf: d.cnpjCpf,
          ...(Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== undefined)) as typeof campos),
          observacoes: d.codigo ? `Código no sistema antigo: ${d.codigo}` : undefined,
        });
        continue;
      }
      const dif = diferencas(ex as unknown as Record<string, Valor>, campos);
      if (Object.keys(dif).length === 0) {
        ctx.plano.iguais++;
        continue;
      }
      ctx.plano.atualizar++;
      ops.push((tx) => tx.fornecedor.update({ where: { id: ex.id }, data: dif as Prisma.FornecedorUpdateInput }));
    }
    if (novos.length) ops.unshift((tx) => tx.fornecedor.createMany({ data: novos, skipDuplicates: true }));
    await executarOps(ctx, ops);
  }
}

// ---------------------------------------------------------------------------
// CONTA_RECEBER (saldo em aberto)
// ---------------------------------------------------------------------------
async function importarContasReceber(ctx: Ctx, regs: RegistroValidado<ContaReceberDados>[]) {
  for (const grupo of pedacos(regs)) {
    const mapeados = await carregarChaves(ctx, "CONTA_RECEBER", grupo.map((r) => r.chave));
    const contas = await ctx.db.contaReceber.findMany({
      where: { empresaId: ctx.empresaId, id: { in: [...mapeados.values()] } },
    });
    const contaPorId = new Map(contas.map((c) => [c.id, c]));
    const clientePorCodigo = await carregarChaves(
      ctx,
      "CLIENTE",
      grupo.filter((r) => r.dados!.clienteCodigo).map((r) => `C:${r.dados!.clienteCodigo}`),
    );
    const docs = grupo.map((r) => r.dados!.clienteCpfCnpj).filter((d): d is string => !!d);
    const clientesDoc = docs.length
      ? await ctx.db.cliente.findMany({
          where: { empresaId: ctx.empresaId, cpfCnpj: { in: docs } },
          select: { id: true, cpfCnpj: true },
        })
      : [];
    const clientePorDoc = new Map(clientesDoc.map((c) => [c.cpfCnpj!, c.id]));
    const ops: Op[] = [];

    for (const r of grupo) {
      const d = r.dados!;
      const clienteId =
        (d.clienteCodigo ? clientePorCodigo.get(`C:${d.clienteCodigo}`) : undefined) ??
        (d.clienteCpfCnpj ? clientePorDoc.get(d.clienteCpfCnpj) : undefined);
      if (!clienteId) {
        falhar(
          ctx,
          r,
          "CONTA_RECEBER",
          `Cliente ${d.clienteCodigo ?? mascararDoc(d.clienteCpfCnpj)} não encontrado: importe os clientes antes`,
        );
        continue;
      }
      const campos = {
        clienteId,
        documento: d.documento,
        parcela: d.parcela,
        totalParcelas: d.totalParcelas,
        dataVencimento: d.dataVencimento,
        valor: d.valor.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
        formaPagamento: d.formaPagamento,
      };
      const crediario = d.formaPagamento === "CREDIARIO";
      const idMapeado = mapeados.get(r.chave);
      const ex = idMapeado ? contaPorId.get(idMapeado) : undefined;
      if (ex) {
        if (ex.status !== "ABERTO" || !ex.valorRecebido.isZero()) {
          const dif = diferencas(ex as unknown as Record<string, Valor>, campos);
          if (Object.keys(dif).length) {
            ctx.plano.bloqueados++;
            avisar(ctx, r, "CONTA_RECEBER", "Título já recebido ou renegociado no ERP: não alterado");
          } else ctx.plano.iguais++;
          continue;
        }
        const dif = diferencas(ex as unknown as Record<string, Valor>, campos);
        if (Object.keys(dif).length === 0) {
          ctx.plano.iguais++;
          continue;
        }
        ctx.plano.atualizar++;
        auditar(
          ctx,
          "CONTA_RECEBER_ALTERADA_IMPLANTACAO",
          "ContaReceber",
          ex.id,
          Object.fromEntries(Object.keys(dif).map((k) => [k, (ex as Record<string, unknown>)[k]])),
          dif,
        );
        const exId = ex.id;
        const eraCrediario = ex.formaPagamento === "CREDIARIO";
        const valorAntigo = ex.valor;
        const clienteAntigo = ex.clienteId;
        ops.push(async (tx) => {
          await tx.contaReceber.update({ where: { id: exId }, data: dif as Prisma.ContaReceberUncheckedUpdateInput });
          // mantém o saldo devedor do crediário coerente com os títulos
          if (eraCrediario && clienteAntigo)
            await tx.cliente.update({ where: { id: clienteAntigo }, data: { saldoDevedor: { decrement: valorAntigo } } });
          if (crediario) await tx.cliente.update({ where: { id: clienteId }, data: { saldoDevedor: { increment: campos.valor } } });
        });
        continue;
      }

      ctx.plano.criar++;
      const chave = r.chave;
      const descricao =
        d.descricao ??
        `Saldo importado${d.documento ? ` doc ${d.documento}` : ""} parcela ${d.parcela}/${d.totalParcelas}`;
      ops.push(async (tx) => {
        const c = await tx.contaReceber.create({
          data: {
            empresaId: ctx.empresaId,
            ...campos,
            descricao,
            status: "ABERTO",
            observacoes: "Importado na implantação",
          },
          select: { id: true },
        });
        await gravarChave(ctx, "CONTA_RECEBER", chave, c.id)(tx);
        if (crediario) await tx.cliente.update({ where: { id: clienteId }, data: { saldoDevedor: { increment: campos.valor } } });
      });
    }
    await executarOps(ctx, ops);
  }
}

// ---------------------------------------------------------------------------
// Conferência do que ficou gravado
// ---------------------------------------------------------------------------
async function totaisDestino(ctx: Ctx, entidade: Entidade, validos: RegistroValidado<unknown>[]): Promise<Totais> {
  const chaves = validos.map((r) => r.chave);
  if (entidade === "PRODUTO" || entidade === "PRECO") {
    let n = 0;
    for (const g of pedacos(chaves, 1000))
      n += await ctx.db.produto.count({ where: { empresaId: ctx.empresaId, sku: { in: g } } });
    return { registros: n };
  }
  if (entidade === "FORNECEDOR") {
    let n = 0;
    for (const g of pedacos(chaves, 1000))
      n += await ctx.db.fornecedor.count({ where: { empresaId: ctx.empresaId, cnpjCpf: { in: g } } });
    return { registros: n };
  }
  if (entidade === "CLIENTE") {
    const m = await carregarChaves(ctx, "CLIENTE", chaves);
    return { registros: m.size };
  }
  if (entidade === "CONTA_RECEBER") {
    const m = await carregarChaves(ctx, "CONTA_RECEBER", chaves);
    let total = 0;
    let n = 0;
    for (const g of pedacos([...new Set(m.values())], 1000)) {
      const cs = await ctx.db.contaReceber.findMany({
        where: { empresaId: ctx.empresaId, id: { in: g } },
        select: { valor: true, valorRecebido: true, status: true },
      });
      for (const c of cs) {
        if (c.status === "PAGO" || c.status === "CANCELADO") continue;
        n++;
        total += paraCentavos(c.valor.sub(c.valorRecebido));
      }
    }
    // dois títulos da origem não apontam para o mesmo daqui; m.size == títulos gravados
    return { registros: n, valorAbertoCentavos: total };
  }
  // ESTOQUE
  const produtoIds = [...new Set(ctx.paresEstoque.map((p) => p.produtoId))];
  const depIds = [...new Set(ctx.paresEstoque.map((p) => p.depositoId))];
  const achados = new Map<string, { quantidade: Dec; custo: Dec }>();
  for (const g of pedacos(produtoIds, 1000)) {
    const rows = await ctx.db.estoqueDeposito.findMany({
      where: { produtoId: { in: g }, depositoId: { in: depIds } },
      select: { produtoId: true, depositoId: true, quantidade: true, produto: { select: { custoMedio: true } } },
    });
    for (const r of rows)
      achados.set(`${r.produtoId}@${r.depositoId}`, { quantidade: r.quantidade, custo: r.produto.custoMedio });
  }
  let qtd = new Decimal(0);
  let valor = new Decimal(0);
  let n = 0;
  for (const p of ctx.paresEstoque) {
    const a = achados.get(`${p.produtoId}@${p.depositoId}`);
    if (!a) {
      if (p.zero) n++; // saldo zero que nunca existiu aqui não precisa de registro
      continue;
    }
    n++;
    qtd = qtd.add(a.quantidade);
    valor = valor.add(a.quantidade.mul(a.custo));
  }
  return { registros: n, quantidade: qtd.toFixed(3), valorCustoCentavos: paraCentavos(valor) };
}

// ---------------------------------------------------------------------------

export async function importar(db: PrismaClient, opcoes: OpcoesImportacao): Promise<ResultadoImportacao> {
  const inicio = Date.now();
  const { entidade } = opcoes;
  const registros = validar(entidade, opcoes.registros) as RegistroValidado<DadosPorEntidade[Entidade]>[];

  const lote = await db.importacaoLote.create({
    data: {
      empresaId: opcoes.empresaId,
      usuarioId: opcoes.usuarioId ?? null,
      entidade,
      origem: opcoes.origem,
      arquivoNome: opcoes.arquivoNome?.slice(0, 200),
      simulacao: opcoes.simular,
      status: "EM_ANDAMENTO",
    },
    select: { id: true },
  });

  const ctx: Ctx = {
    db,
    empresaId: opcoes.empresaId,
    usuarioId: opcoes.usuarioId ?? null,
    loteId: lote.id,
    simular: opcoes.simular,
    plano: { criar: 0, atualizar: 0, iguais: 0, bloqueados: 0, comErro: 0 },
    problemas: [],
    novosDepositos: [],
    auditoria: [],
    custoPorSku: new Map(),
    depositoPadraoNome: opcoes.depositoPadrao ?? "",
    paresEstoque: [],
    opcoes,
  };

  for (const r of registros) {
    if (!r.dados) ctx.plano.comErro++;
    for (const e of r.erros)
      ctx.problemas.push({ linha: r.linha, ref: r.ref, chave: chaveExibicao(entidade, r.chave), tipo: "erro", mensagem: e });
    for (const a of r.avisos)
      ctx.problemas.push({ linha: r.linha, ref: r.ref, chave: chaveExibicao(entidade, r.chave), tipo: "aviso", mensagem: a });
  }
  const validos = () => registros.filter((r) => r.dados);

  let mensagemErro: string | undefined;
  try {
    const v = validos();
    if (entidade === "PRODUTO") await importarProdutos(ctx, v as RegistroValidado<ProdutoDados>[]);
    else if (entidade === "PRECO") await importarPrecos(ctx, v as RegistroValidado<PrecoDados>[]);
    else if (entidade === "ESTOQUE") await importarEstoque(ctx, v as RegistroValidado<EstoqueDados>[]);
    else if (entidade === "CLIENTE") await importarClientes(ctx, v as RegistroValidado<ClienteDados>[]);
    else if (entidade === "FORNECEDOR") await importarFornecedores(ctx, v as RegistroValidado<FornecedorDados>[]);
    else if (entidade === "CONTA_RECEBER") await importarContasReceber(ctx, v as RegistroValidado<ContaReceberDados>[]);
  } catch (e) {
    console.error("[implantacao]", erroSeguro(e));
    mensagemErro =
      "A gravação parou no meio. O que já foi gravado fica; rode de novo depois de corrigir (não duplica). " +
      ((e as Error).message ?? "").slice(0, 300);
  }

  const conferencia = conferirOrigem(entidade, registros, {
    custoPorSku: ctx.custoPorSku,
    depositoPadrao: ctx.depositoPadraoNome || undefined,
  });
  if (opcoes.detalhesExtras) Object.assign(conferencia.detalhes, opcoes.detalhesExtras);

  let destino: Totais | undefined;
  let diferencasTot: string[] = [];
  if (!opcoes.simular) {
    destino = await totaisDestino(ctx, entidade, validos() as RegistroValidado<unknown>[]);
    diferencasTot = compararTotais(conferencia.totais, destino);
  }

  const resultado: ResultadoImportacao = {
    loteId: lote.id,
    entidade,
    origem: opcoes.origem,
    simulacao: opcoes.simular,
    status: mensagemErro ? "ERRO" : opcoes.simular ? "SIMULADO" : "APLICADO",
    plano: ctx.plano,
    conferencia,
    destino,
    bate: destino ? diferencasTot.length === 0 && !mensagemErro : undefined,
    diferencas: diferencasTot,
    novosDepositos: ctx.novosDepositos,
    problemas: ctx.problemas,
    mensagemErro,
    duracaoMs: Date.now() - inicio,
  };

  const paraGuardar = { ...resultado, problemas: resultado.problemas.slice(0, 5000) };
  await db.importacaoLote.update({
    where: { id: lote.id },
    data: { status: resultado.status, resumo: JSON.parse(JSON.stringify(paraGuardar)) as Prisma.InputJsonValue },
  });
  if (!opcoes.simular) {
    await db.logAuditoria.create({
      data: {
        usuarioId: ctx.usuarioId,
        acao: `IMPLANTACAO_${entidade}`,
        entidade: "ImportacaoLote",
        entidadeId: lote.id,
        dadosDepois: JSON.parse(
          JSON.stringify({ empresaId: opcoes.empresaId, origem: opcoes.origem, plano: ctx.plano, totais: conferencia.totais, destino, status: resultado.status }),
        ) as Prisma.InputJsonValue,
      },
    });
  }
  return resultado;
}
