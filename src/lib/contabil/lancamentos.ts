import { Prisma } from "@prisma/client";
import { prisma } from "../db";

// Partidas dobradas automáticas (ITG 1000)
// ========================================
// Cada fato administrativo (venda, compra, baixa de título) vira um
// LancamentoContabil balanceado (Σ débitos == Σ créditos) sobre um plano de
// contas mínimo para varejo. Idempotência: @@unique([empresaId, origemTipo,
// origemId]) — repetir a geração não duplica lançamentos.
//
// Nota sobre TipoPlanoConta: o enum do schema só tem RECEITA/DESPESA/
// INVESTIMENTO/TRANSFERENCIA (nasceu no financeiro). Convenção adotada:
//   contas de Ativo (1.x)      → INVESTIMENTO
//   contas de Passivo/PL (2.x) → TRANSFERENCIA
//   contas de Receita (3.x)    → RECEITA (inclusive 3.1.9, redutora)
//   custos/despesas (4.x)      → DESPESA
// A classificação patrimonial real vem do prefixo do código, não do tipo.

// Códigos do plano mínimo — usar estas constantes, nunca strings soltas.
export const CONTAS = {
  CAIXA: "1.1.1",
  CLIENTES: "1.1.2",
  ESTOQUES: "1.1.3",
  FORNECEDORES: "2.1.1",
  OBRIGACOES_TRIBUTARIAS: "2.1.2",
  CAPITAL_SOCIAL: "2.3.1",
  LUCROS_ACUMULADOS: "2.3.2",
  RECEITA_VENDAS: "3.1.1",
  DEDUCOES_IMPOSTOS: "3.1.9",
  CMV: "4.1.1",
  DESPESAS_OPERACIONAIS: "4.2.1",
} as const;

type TipoPlano = "RECEITA" | "DESPESA" | "INVESTIMENTO" | "TRANSFERENCIA";

const PLANO_MINIMO: { codigo: string; nome: string; tipo: TipoPlano; parent?: string }[] = [
  { codigo: "1", nome: "Ativo", tipo: "INVESTIMENTO" },
  { codigo: "1.1", nome: "Ativo Circulante", tipo: "INVESTIMENTO", parent: "1" },
  { codigo: "1.1.1", nome: "Caixa e Equivalentes", tipo: "INVESTIMENTO", parent: "1.1" },
  { codigo: "1.1.2", nome: "Clientes", tipo: "INVESTIMENTO", parent: "1.1" },
  { codigo: "1.1.3", nome: "Estoques", tipo: "INVESTIMENTO", parent: "1.1" },
  { codigo: "2", nome: "Passivo", tipo: "TRANSFERENCIA" },
  { codigo: "2.1", nome: "Passivo Circulante", tipo: "TRANSFERENCIA", parent: "2" },
  { codigo: "2.1.1", nome: "Fornecedores", tipo: "TRANSFERENCIA", parent: "2.1" },
  { codigo: "2.1.2", nome: "Obrigações Tributárias", tipo: "TRANSFERENCIA", parent: "2.1" },
  { codigo: "2.3", nome: "Patrimônio Líquido", tipo: "TRANSFERENCIA", parent: "2" },
  { codigo: "2.3.1", nome: "Capital Social", tipo: "TRANSFERENCIA", parent: "2.3" },
  { codigo: "2.3.2", nome: "Lucros Acumulados", tipo: "TRANSFERENCIA", parent: "2.3" },
  { codigo: "3", nome: "Receitas", tipo: "RECEITA" },
  { codigo: "3.1", nome: "Receita Operacional", tipo: "RECEITA", parent: "3" },
  { codigo: "3.1.1", nome: "Receita de Vendas", tipo: "RECEITA", parent: "3.1" },
  { codigo: "3.1.9", nome: "(-) Deduções e Impostos sobre Vendas", tipo: "RECEITA", parent: "3.1" },
  { codigo: "4", nome: "Custos e Despesas", tipo: "DESPESA" },
  { codigo: "4.1", nome: "Custos", tipo: "DESPESA", parent: "4" },
  { codigo: "4.1.1", nome: "Custo das Mercadorias Vendidas (CMV)", tipo: "DESPESA", parent: "4.1" },
  { codigo: "4.2", nome: "Despesas", tipo: "DESPESA", parent: "4" },
  { codigo: "4.2.1", nome: "Despesas Operacionais", tipo: "DESPESA", parent: "4.2" },
];

// Garante o plano mínimo (idempotente). PlanoConta não tem unique em codigo,
// então o "upsert" é findFirst+create — serializado por advisory lock para
// duas gerações concorrentes não criarem o plano em duplicidade.
// Retorna mapa codigo → id.
export async function garantirPlanoContasPadrao(): Promise<Map<string, string>> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('plano-padrao'))`;
    const ids = new Map<string, string>();
    for (const c of PLANO_MINIMO) {
      const existente = await tx.planoConta.findFirst({
        where: { codigo: c.codigo },
        select: { id: true },
      });
      if (existente) {
        ids.set(c.codigo, existente.id);
        continue;
      }
      const criada = await tx.planoConta.create({
        data: {
          codigo: c.codigo,
          nome: c.nome,
          tipo: c.tipo,
          parentId: c.parent ? ids.get(c.parent) ?? null : null,
        },
        select: { id: true },
      });
      ids.set(c.codigo, criada.id);
    }
    return ids;
  });
}

async function contaId(codigo: string): Promise<string> {
  const conta = await prisma.planoConta.findFirst({ where: { codigo }, select: { id: true } });
  if (!conta) {
    throw new Error(`Conta ${codigo} não existe no plano — rode garantirPlanoContasPadrao()`);
  }
  return conta.id;
}

type PartidaInput = { conta: string; natureza: "DEBITO" | "CREDITO"; valor: number };

export type ResultadoLancamento = {
  jaExistia: boolean;
  lancamentoId?: string;
  // Venda sem valor e sem custo (ex.: brinde/ajuste) — nada a contabilizar.
  ignorada?: boolean;
};

const centavos = (n: number) => Math.round(n * 100);

// Cria um lançamento balanceado. Valida Σ débitos == Σ créditos (em centavos,
// sem drift de float) antes de gravar. P2002 → já existia (idempotência).
async function criarLancamento(opts: {
  empresaId: string;
  data: Date;
  historico: string;
  origemTipo: string;
  origemId: string;
  partidas: PartidaInput[];
}): Promise<ResultadoLancamento> {
  const partidas = opts.partidas.filter((p) => centavos(p.valor) > 0);
  if (partidas.length < 2) {
    throw new Error(`Lançamento "${opts.historico}" precisa de ao menos 1 débito e 1 crédito`);
  }
  const deb = partidas.filter((p) => p.natureza === "DEBITO").reduce((a, p) => a + centavos(p.valor), 0);
  const cred = partidas.filter((p) => p.natureza === "CREDITO").reduce((a, p) => a + centavos(p.valor), 0);
  if (deb !== cred || deb === 0) {
    throw new Error(
      `Lançamento desbalanceado "${opts.historico}": D ${(deb / 100).toFixed(2)} x C ${(cred / 100).toFixed(2)}`,
    );
  }

  const contas = new Map<string, string>();
  for (const p of partidas) {
    if (!contas.has(p.conta)) contas.set(p.conta, await contaId(p.conta));
  }

  try {
    const lanc = await prisma.lancamentoContabil.create({
      data: {
        empresaId: opts.empresaId,
        data: opts.data,
        historico: opts.historico,
        origemTipo: opts.origemTipo,
        origemId: opts.origemId,
        partidas: {
          create: partidas.map((p) => ({
            planoContaId: contas.get(p.conta)!,
            natureza: p.natureza,
            valor: new Prisma.Decimal(p.valor.toFixed(2)),
          })),
        },
      },
      select: { id: true },
    });
    return { jaExistia: false, lancamentoId: lanc.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { jaExistia: true };
    }
    throw e;
  }
}

// Venda PAGA → D Caixa/Clientes x C Receita (valorTotal) + D CMV x C Estoques
// (custoTotal). Pagamentos mistos: a parte CREDIARIO/BOLETO debita Clientes,
// o restante Caixa — continua um único lançamento balanceado (origem VENDA).
export async function lancarVenda(vendaId: string): Promise<ResultadoLancamento> {
  const venda = await prisma.venda.findUniqueOrThrow({
    where: { id: vendaId },
    include: { pagamentos: true },
  });
  if (venda.status !== "PAGA") {
    throw new Error(`Venda #${venda.numero} não está PAGA (status ${venda.status})`);
  }

  const total = Number(venda.valorTotal);
  const custo = Number(venda.custoTotal);
  if (centavos(total) === 0 && centavos(custo) === 0) {
    // Nada a lançar (venda zerada) — não é erro nem duplicidade.
    return { jaExistia: false, ignorada: true };
  }
  const aPrazoBruto = venda.pagamentos
    .filter((p) => p.formaPagamento === "CREDIARIO" || p.formaPagamento === "BOLETO")
    .reduce((a, p) => a + Number(p.valor), 0);
  const aPrazo = Math.min(aPrazoBruto, total);

  const partidas: PartidaInput[] = [
    { conta: CONTAS.CAIXA, natureza: "DEBITO", valor: total - aPrazo },
    { conta: CONTAS.CLIENTES, natureza: "DEBITO", valor: aPrazo },
    { conta: CONTAS.RECEITA_VENDAS, natureza: "CREDITO", valor: total },
  ];
  if (centavos(custo) > 0) {
    partidas.push(
      { conta: CONTAS.CMV, natureza: "DEBITO", valor: custo },
      { conta: CONTAS.ESTOQUES, natureza: "CREDITO", valor: custo },
    );
  }

  return criarLancamento({
    empresaId: venda.empresaId,
    data: venda.fechadaEm ?? venda.criadaEm,
    historico: `Venda #${venda.numero}`,
    origemTipo: "VENDA",
    origemId: vendaId,
    partidas,
  });
}

// Nota de entrada → D Estoques x C Fornecedores pelo valorTotal.
export async function lancarCompra(notaEntradaId: string): Promise<ResultadoLancamento> {
  const nota = await prisma.notaEntrada.findUniqueOrThrow({
    where: { id: notaEntradaId },
    include: { fornecedor: { select: { empresaId: true, razaoSocial: true } } },
  });

  return criarLancamento({
    empresaId: nota.fornecedor.empresaId,
    data: nota.dataEntrada,
    historico: `Compra NF ${nota.numero}/${nota.serie} - ${nota.fornecedor.razaoSocial}`,
    origemTipo: "COMPRA",
    origemId: notaEntradaId,
    partidas: [
      { conta: CONTAS.ESTOQUES, natureza: "DEBITO", valor: Number(nota.valorTotal) },
      { conta: CONTAS.FORNECEDORES, natureza: "CREDITO", valor: Number(nota.valorTotal) },
    ],
  });
}

// Baixa de conta a receber → D Caixa x C Clientes.
// `valorRecebidoAcumulado` é o TOTAL recebido até agora (ContaReceber.
// valorRecebido) — a função lança apenas o DELTA sobre o que já foi
// contabilizado. Idempotente e re-executável.
export async function lancarBaixaReceber(
  contaReceberId: string,
  valorRecebidoAcumulado: number,
): Promise<ResultadoLancamento> {
  const conta = await prisma.contaReceber.findUniqueOrThrow({
    where: { id: contaReceberId },
    select: { empresaId: true, descricao: true, dataRecebimento: true },
  });
  return lancarBaixa({
    empresaId: conta.empresaId,
    data: conta.dataRecebimento ?? new Date(),
    historico: `Recebimento: ${conta.descricao}`,
    origemTipo: "BAIXA_CR",
    origemBase: contaReceberId,
    valorAcumulado: valorRecebidoAcumulado,
    contaDebito: CONTAS.CAIXA,
    contaCredito: CONTAS.CLIENTES,
  });
}

// Baixa de conta a pagar → D Fornecedores x C Caixa. Mesma regra de delta,
// sobre ContaPagar.valorPago acumulado.
export async function lancarBaixaPagar(
  contaPagarId: string,
  valorPagoAcumulado: number,
): Promise<ResultadoLancamento> {
  const conta = await prisma.contaPagar.findUniqueOrThrow({
    where: { id: contaPagarId },
    select: { empresaId: true, descricao: true, dataPagamento: true },
  });
  return lancarBaixa({
    empresaId: conta.empresaId,
    data: conta.dataPagamento ?? new Date(),
    historico: `Pagamento: ${conta.descricao}`,
    origemTipo: "BAIXA_CP",
    origemBase: contaPagarId,
    valorAcumulado: valorPagoAcumulado,
    contaDebito: CONTAS.FORNECEDORES,
    contaCredito: CONTAS.CAIXA,
  });
}

// Lançamento de DELTA: soma o que já foi lançado para esta conta (origemId
// começa com o id — 1ª baixa `id`, seguintes `id:2`, `id:3`...) e lança só a
// diferença até o acumulado. Delta <= 0 → nada novo a contabilizar.
async function lancarBaixa(opts: {
  empresaId: string;
  data: Date;
  historico: string;
  origemTipo: "BAIXA_CR" | "BAIXA_CP";
  origemBase: string;
  valorAcumulado: number;
  contaDebito: string;
  contaCredito: string;
}): Promise<ResultadoLancamento> {
  const existentes = await prisma.lancamentoContabil.findMany({
    where: {
      empresaId: opts.empresaId,
      origemTipo: opts.origemTipo,
      origemId: { startsWith: opts.origemBase },
    },
    select: {
      partidas: { where: { natureza: "DEBITO" }, select: { valor: true } },
    },
  });
  const somaJaLancada = existentes.reduce(
    (acc, l) => acc + l.partidas.reduce((s, p) => s + Number(p.valor), 0),
    0,
  );
  const delta = (centavos(opts.valorAcumulado) - centavos(somaJaLancada)) / 100;
  if (delta <= 0) return { jaExistia: true };

  // Sufixo determinístico: re-execução concorrente colide no unique (P2002)
  // em vez de duplicar — criarLancamento devolve {jaExistia: true}.
  const origemId =
    existentes.length === 0 ? opts.origemBase : `${opts.origemBase}:${existentes.length + 1}`;

  return criarLancamento({
    empresaId: opts.empresaId,
    data: opts.data,
    historico: opts.historico,
    origemTipo: opts.origemTipo,
    origemId,
    partidas: [
      { conta: opts.contaDebito, natureza: "DEBITO", valor: delta },
      { conta: opts.contaCredito, natureza: "CREDITO", valor: delta },
    ],
  });
}

export type ResumoGeracao = {
  vendas: number;
  compras: number;
  baixas: number;
  jaExistiam: number;
  ignoradas: number;
  erros: string[];
};

// Varre o período e contabiliza tudo que ainda não tem lançamento.
// Baixas: lançamento de DELTA sobre o acumulado (valorRecebido/valorPago) —
// re-executar o lote só lança o que ainda não foi contabilizado.
// Falhas individuais não abortam o lote: acumulam em `erros`.
export async function gerarLancamentosPeriodo(
  empresaId: string,
  de: Date,
  ate: Date,
): Promise<ResumoGeracao> {
  const resumo: ResumoGeracao = {
    vendas: 0,
    compras: 0,
    baixas: 0,
    jaExistiam: 0,
    ignoradas: 0,
    erros: [],
  };
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  // 1) Vendas pagas do período: janela por fechadaEm; vendas sem fechadaEm
  // caem na janela por criadaEm.
  const vendas = await prisma.venda.findMany({
    where: {
      empresaId,
      status: "PAGA",
      OR: [
        { fechadaEm: { gte: de, lte: ate } },
        { fechadaEm: null, criadaEm: { gte: de, lte: ate } },
      ],
    },
    select: { id: true },
    orderBy: { criadaEm: "asc" },
  });
  for (const v of vendas) {
    try {
      const r = await lancarVenda(v.id);
      if (r.ignorada) resumo.ignoradas++;
      else if (r.jaExistia) resumo.jaExistiam++;
      else resumo.vendas++;
    } catch (e) {
      resumo.erros.push(`Venda ${v.id}: ${msg(e)}`);
    }
  }

  // 2) Notas de entrada do período (empresa via fornecedor)
  const notas = await prisma.notaEntrada.findMany({
    where: { fornecedor: { empresaId }, dataEntrada: { gte: de, lte: ate } },
    select: { id: true },
    orderBy: { dataEntrada: "asc" },
  });
  for (const n of notas) {
    try {
      const r = await lancarCompra(n.id);
      if (r.jaExistia) resumo.jaExistiam++;
      else resumo.compras++;
    } catch (e) {
      resumo.erros.push(`Nota de entrada ${n.id}: ${msg(e)}`);
    }
  }

  // 3) Baixas de contas a receber (recebidas no período) — delta do acumulado
  const recebidas = await prisma.contaReceber.findMany({
    where: {
      empresaId,
      dataRecebimento: { gte: de, lte: ate },
      valorRecebido: { gt: 0 },
      status: { in: ["PAGO", "PARCIALMENTE_PAGO"] },
    },
    select: { id: true, valorRecebido: true },
  });
  for (const c of recebidas) {
    try {
      const r = await lancarBaixaReceber(c.id, Number(c.valorRecebido));
      if (r.jaExistia) resumo.jaExistiam++;
      else resumo.baixas++;
    } catch (e) {
      resumo.erros.push(`Baixa CR ${c.id}: ${msg(e)}`);
    }
  }

  // 4) Baixas de contas a pagar (pagas no período) — delta do acumulado
  const pagas = await prisma.contaPagar.findMany({
    where: {
      empresaId,
      dataPagamento: { gte: de, lte: ate },
      valorPago: { gt: 0 },
      status: { in: ["PAGO", "PARCIALMENTE_PAGO"] },
    },
    select: { id: true, valorPago: true },
  });
  for (const c of pagas) {
    try {
      const r = await lancarBaixaPagar(c.id, Number(c.valorPago));
      if (r.jaExistia) resumo.jaExistiam++;
      else resumo.baixas++;
    } catch (e) {
      resumo.erros.push(`Baixa CP ${c.id}: ${msg(e)}`);
    }
  }

  return resumo;
}
