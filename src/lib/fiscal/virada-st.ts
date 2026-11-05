// Virada da ST de autopeças em SP (01/10/2026)
// ===========================================
// 1. Prévia + ajuste em lote do cadastro: produtos de autopeça que ainda estão
//    com CST 60 / CSOSN 500 / CFOP 5405 passam para tributação normal
//    (sugerirTributacaoPosSt). CEST é mantido. Cada produto alterado gera
//    LogAuditoria com antes e depois.
// 2. Relatório do estoque em 30/09/2026 com o ICMS-ST das entradas, para o
//    crédito/ressarcimento da Portaria CAT 28/2020. SÓ RELATÓRIO: o lançamento
//    (E111 SP020750 no regime normal; PGDAS-D no Simples) é do contador.
// Fontes:
//   Portaria SRE 34/2026: https://legislacao.fazenda.sp.gov.br/Paginas/Portaria-SRE-34-de-2026.aspx
//   Leitura da CAT 28/2020 (blog, a conferir no texto oficial):
//   https://clmcontroller.com.br/en/tributos/fim-do-icms-st-para-autopecas-em-sao-paulo-o-que-muda/

import { prisma } from "../db";
import { reaisParaCentavos } from "./centavos";
import {
  cadastroComSt,
  ehAutopeca,
  sugerirTributacaoPosSt,
  type ProdutoFiscalBasico,
  type RegimeEmitente,
} from "./st-sp";
import { DATA_ESTOQUE_VIRADA_ST_SP, inicioDiaBrasilia } from "./vigencias";
import { itensDoXmlNfe } from "../nfe/xml-nfe";

// ---------------------------------------------------------------- cadastro

export interface ProdutoVirada extends ProdutoFiscalBasico {
  id: string;
  sku: string;
  nome: string;
  cfopVendaInterestadual?: string | null;
}

export interface LinhaPreviaVirada {
  produtoId: string;
  sku: string;
  nome: string;
  ncm: string | null;
  cest: string | null;
  situacao: "AJUSTAR" | "REVISAR_MANUAL";
  motivo: string;
  antes: { cstIcms: string | null; cfopVendaInterna: string | null };
  depois: { cstIcms: string; cfopVendaInterna: string } | null;
  aviso?: string;
}

export function classificarProdutoVirada(p: ProdutoVirada, regime: RegimeEmitente): LinhaPreviaVirada | null {
  if (!cadastroComSt(p)) return null;
  const antes = { cstIcms: p.cstIcms ?? null, cfopVendaInterna: p.cfopVendaInterna ?? null };
  const base = { produtoId: p.id, sku: p.sku, nome: p.nome, ncm: p.ncm ?? null, cest: p.cest ?? null, antes };
  const avisoInter =
    p.cfopVendaInterestadual && ["6403", "6404", "6401"].includes(p.cfopVendaInterestadual)
      ? `CFOP interestadual ${p.cfopVendaInterestadual} não foi alterado: a ST pode continuar no estado de destino. Confira com o contador.`
      : undefined;
  if (!ehAutopeca(p)) {
    return {
      ...base,
      situacao: "REVISAR_MANUAL",
      motivo: p.cest
        ? `CEST ${p.cest} não é do segmento de autopeças (01). Pode continuar com ST — confira com o contador.`
        : "Sem CEST e NCM fora da posição 8708: não dá para afirmar que é autopeça.",
      depois: null,
      aviso: avisoInter,
    };
  }
  return {
    ...base,
    situacao: "AJUSTAR",
    motivo: "Autopeça saiu da ST em SP em 01/10/2026 (Portaria SRE 34/2026). CEST mantido.",
    depois: sugerirTributacaoPosSt(regime),
    aviso: avisoInter,
  };
}

export async function previaViradaSt(empresaId: string) {
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: empresaId },
    select: { regimeTributario: true, uf: true },
  });
  const produtos = await prisma.produto.findMany({
    where: { empresaId, ativo: true },
    select: {
      id: true, sku: true, nome: true, ncm: true, cest: true,
      cstIcms: true, cfopVendaInterna: true, cfopVendaInterestadual: true,
    },
    orderBy: { sku: "asc" },
  });
  const linhas = produtos
    .map((p) => classificarProdutoVirada(p, empresa.regimeTributario as RegimeEmitente))
    .filter((l): l is LinhaPreviaVirada => !!l);
  return {
    uf: empresa.uf,
    aplicavel: empresa.uf === "SP",
    regime: empresa.regimeTributario,
    ajustar: linhas.filter((l) => l.situacao === "AJUSTAR"),
    revisarManual: linhas.filter((l) => l.situacao === "REVISAR_MANUAL"),
  };
}

/** Aplica só os produtos escolhidos que, na hora, ainda estão na situação AJUSTAR. */
export async function aplicarViradaSt(opts: { empresaId: string; usuarioId: string; produtoIds: string[] }) {
  const previa = await previaViradaSt(opts.empresaId);
  if (!previa.aplicavel) throw new Error("A virada da ST de autopeças vale só para empresa de SP.");
  const escolhidos = new Set(opts.produtoIds);
  const alvo = previa.ajustar.filter((l) => escolhidos.has(l.produtoId));
  await prisma.$transaction(async (tx) => {
    for (const l of alvo) {
      await tx.produto.updateMany({
        where: { id: l.produtoId, empresaId: opts.empresaId },
        data: { cstIcms: l.depois!.cstIcms, cfopVendaInterna: l.depois!.cfopVendaInterna },
      });
      await tx.logAuditoria.create({
        data: {
          usuarioId: opts.usuarioId,
          acao: "VIRADA_ST_SP_2026",
          entidade: "Produto",
          entidadeId: l.produtoId,
          dadosAntes: { ...l.antes, empresaId: opts.empresaId },
          dadosDepois: { ...l.depois!, empresaId: opts.empresaId, fonte: "Portaria SRE 34/2026" },
        },
      });
    }
  });
  return { alterados: alvo.length, ignorados: opts.produtoIds.length - alvo.length };
}

// --------------------------------------------------- estoque de 30/09/2026

export interface EntradaComSt {
  data: Date;
  notaNumero: string;
  chave: string | null;
  quantidade: number;
  /** ICMS-ST do item na nota (retido anteriormente ou destacado), em centavos. */
  stCentavos: number;
}

export interface CreditoProduto {
  quantidadeEstoque: number;
  quantidadeCoberta: number;
  stCentavos: number;
  notas: Array<{ notaNumero: string; chave: string | null; quantidadeUsada: number; stCentavos: number }>;
  semSt: boolean;
}

/**
 * Usa as entradas mais recentes até cobrir o estoque da data (método usual de
 * apuração do estoque com ST; CONFERIR com o texto da CAT 28/2020).
 * ST proporcional à quantidade usada de cada nota, arredondada por nota.
 */
export function calcularCreditoEstoque(quantidadeEstoque: number, entradas: EntradaComSt[]): CreditoProduto {
  const ordenadas = [...entradas].sort((a, b) => b.data.getTime() - a.data.getTime());
  let faltaMil = Math.max(0, Math.round(quantidadeEstoque * 1000));
  const notas: CreditoProduto["notas"] = [];
  let total = 0;
  for (const e of ordenadas) {
    if (faltaMil <= 0) break;
    const qMil = Math.round(e.quantidade * 1000);
    if (qMil <= 0) continue;
    const usarMil = Math.min(qMil, faltaMil);
    const st = Math.round((e.stCentavos * usarMil) / qMil);
    notas.push({ notaNumero: e.notaNumero, chave: e.chave, quantidadeUsada: usarMil / 1000, stCentavos: st });
    total += st;
    faltaMil -= usarMil;
  }
  const coberta = Math.max(0, Math.round(quantidadeEstoque * 1000)) - faltaMil;
  return {
    quantidadeEstoque,
    quantidadeCoberta: coberta / 1000,
    stCentavos: total,
    notas,
    semSt: total === 0,
  };
}

const SINAL: Record<string, number> = {
  ENTRADA: 1, AJUSTE_POSITIVO: 1, TRANSFERENCIA_ENTRADA: 1,
  SAIDA: -1, AJUSTE_NEGATIVO: -1, TRANSFERENCIA_SAIDA: -1,
};

/** Saldo numa data = saldo atual − movimentos posteriores (com sinal). */
export function saldoNaData(saldoAtual: number, movimentosDepois: Array<{ tipo: string; quantidade: number }>): number {
  const mil = movimentosDepois.reduce((a, m) => a + (SINAL[m.tipo] ?? 0) * Math.round(m.quantidade * 1000), 0);
  return (Math.round(saldoAtual * 1000) - mil) / 1000;
}

export const INSTRUCAO_CAT_28 = [
  "Este relatório lista o estoque de autopeças no fim de 30/09/2026 e o ICMS-ST pago nas entradas mais recentes que cobrem esse estoque.",
  "Regime normal: o crédito costuma ser lançado na EFD (registro E111, código SP020750), em parcelas, com o inventário no Bloco H (motivo 02). Leitura de blog; confirmar no texto da Portaria CAT 28/2020.",
  "Simples Nacional: o tratamento é diferente (ressarcimento/compensação). Decisão do contador.",
  "Entrada sem ICMS-ST informado no XML (vICMSSTRet/vICMSST) não gera crédito.",
  "Se o estoque não estiver coberto por notas importadas, importe os XMLs que faltam ou levante com o contador.",
  "O sistema NÃO faz nenhum lançamento: entregue este relatório ao contador.",
];

export async function relatorioEstoqueViradaSt(empresaId: string) {
  const corte = inicioDiaBrasilia("2026-10-01"); // fim do dia 30/09/2026 em Brasília
  const produtos = await prisma.produto.findMany({
    where: { empresaId },
    select: {
      id: true, sku: true, nome: true, ncm: true, cest: true,
      estoques: { select: { quantidade: true } },
    },
    orderBy: { sku: "asc" },
  });
  const autopecas = produtos.filter((p) => ehAutopeca(p));
  const ids = autopecas.map((p) => p.id);

  const movs = await prisma.movimentoEstoque.findMany({
    where: { produtoId: { in: ids }, criadoEm: { gte: corte } },
    select: { produtoId: true, tipo: true, quantidade: true },
  });
  const itensEntrada = await prisma.itemNotaEntrada.findMany({
    where: { produtoId: { in: ids }, nota: { dataEntrada: { lt: corte }, fornecedor: { empresaId } } },
    select: {
      produtoId: true, quantidade: true, codigoFornecedor: true,
      vIcmsSt: true, vIcmsStRet: true,
      nota: { select: { id: true, numero: true, chaveAcesso: true, dataEntrada: true, xmlOriginal: true } },
    },
  });

  // Notas importadas antes desta versão não têm a ST por item: lê do XML guardado.
  const cacheXml = new Map<string, ReturnType<typeof itensDoXmlNfe>>();
  const stDoItem = (i: (typeof itensEntrada)[number]): number => {
    const direto = i.vIcmsStRet ?? i.vIcmsSt;
    if (direto != null) return reaisParaCentavos(direto);
    if (!i.nota.xmlOriginal) return 0;
    if (!cacheXml.has(i.nota.id)) cacheXml.set(i.nota.id, itensDoXmlNfe(i.nota.xmlOriginal));
    const x = cacheXml.get(i.nota.id)!.find((d) => d.cProd === i.codigoFornecedor);
    const v = x?.vIcmsStRet ?? x?.vIcmsSt;
    return v != null ? reaisParaCentavos(v) : 0;
  };

  const linhas = autopecas.map((p) => {
    const atual = p.estoques.reduce((a, e) => a + Number(e.quantidade), 0);
    const saldo = saldoNaData(
      atual,
      movs.filter((m) => m.produtoId === p.id).map((m) => ({ tipo: m.tipo, quantidade: Number(m.quantidade) })),
    );
    const entradas: EntradaComSt[] = itensEntrada
      .filter((i) => i.produtoId === p.id)
      .map((i) => ({
        data: i.nota.dataEntrada,
        notaNumero: i.nota.numero,
        chave: i.nota.chaveAcesso,
        quantidade: Number(i.quantidade),
        stCentavos: stDoItem(i),
      }));
    const credito = calcularCreditoEstoque(saldo, entradas);
    return { produtoId: p.id, sku: p.sku, nome: p.nome, ncm: p.ncm, cest: p.cest, ...credito };
  }).filter((l) => l.quantidadeEstoque > 0);

  return {
    dataEstoque: DATA_ESTOQUE_VIRADA_ST_SP,
    totalStCentavos: linhas.reduce((a, l) => a + l.stCentavos, 0),
    produtos: linhas,
    produtosSemCobertura: linhas.filter((l) => l.quantidadeCoberta < l.quantidadeEstoque).length,
    instrucao: INSTRUCAO_CAT_28,
  };
}
