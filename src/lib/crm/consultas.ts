import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { filtroVendaFaturada, sqlVendaFaturada } from "../vendas/venda-faturada";
import { avaliarCadastro, type ProblemaCadastro } from "./qualidade-cadastro";
import { avaliarChurn, metricasCompras, prioridadeRisco, type ResultadoChurn } from "./churn";
import { estoqueParado, type FaixaParado } from "./estoque-parado";
import { agruparVendasPerdidas, type MotivoVendaPerdida, type ProdutoEstoque } from "./vendas-perdidas";
import { paraCentavos } from "./dinheiro";
import { podeVerCredito, documentoParcial } from "./acesso";

// Consultas do "Balcão que aprende" — sempre filtradas por empresaId da sessão.

const DIA_MS = 86_400_000;

// ---------------------------------------------------------------- cadastro
export async function carregarQualidadeCadastro(empresaId: string) {
  const produtos = await prisma.produto.findMany({
    where: { empresaId, ativo: true },
    select: {
      id: true,
      sku: true,
      nome: true,
      marcaId: true,
      marca: { select: { nome: true } },
      ncm: true,
      codigoBarras: true,
      codigoFabricante: true,
      codigoOem: true,
      revisaoCadastro: true,
      revisaoCadastroMotivo: true,
      aplicacaoVerificadaEm: true,
      aplicacaoVerificadaPorNome: true,
      curva: true,
      _count: { select: { aplicacoes: true } },
    },
    orderBy: [{ curva: "asc" }, { nome: "asc" }],
  });
  const avaliacao = avaliarCadastro(
    produtos.map((p) => ({ ...p, qtdAplicacoes: p._count.aplicacoes })),
  );
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const linhas = produtos.map((p) => ({
    id: p.id,
    sku: p.sku,
    nome: p.nome,
    marca: p.marca?.nome ?? null,
    curva: p.curva,
    ncm: p.ncm,
    codigoBarras: p.codigoBarras,
    codigoFabricante: p.codigoFabricante,
    codigoOem: p.codigoOem,
    qtdAplicacoes: p._count.aplicacoes,
    aplicacaoVerificadaEm: p.aplicacaoVerificadaEm,
    aplicacaoVerificadaPorNome: p.aplicacaoVerificadaPorNome,
    revisaoCadastroMotivo: p.revisaoCadastro ? p.revisaoCadastroMotivo : null,
    problemas: avaliacao.problemas.get(p.id) ?? [],
    duplicados: (avaliacao.duplicados.get(p.id) ?? []).map((d) => ({
      ...d,
      outros: d.outrosIds.map((id) => ({ id, sku: porId.get(id)?.sku ?? id })),
    })),
  }));
  return { resumo: avaliacao.resumo, linhas };
}

export function filtrarPorProblema<T extends { problemas: ProblemaCadastro[] }>(linhas: T[], filtro?: string | null) {
  if (!filtro || filtro === "TODOS") return linhas.filter((l) => l.problemas.length > 0);
  return linhas.filter((l) => l.problemas.includes(filtro as ProblemaCadastro));
}

// ---------------------------------------------------------------- clientes
/** Clientes da carteira B2B: PJ ou segmento diferente de consumidor final. */
const filtroB2B = { OR: [{ tipo: "PJ" as const }, { segmento: { not: "CONSUMIDOR_FINAL" as const } }] };

async function comprasPorCliente(empresaId: string, clienteIds?: string[], desde?: Date) {
  const rows = await prisma.$queryRaw<Array<{ clienteId: string; criadaEm: Date; valorTotal: Prisma.Decimal }>>`
    SELECT v."clienteId", COALESCE(v."fechadaEm", v."criadaEm") AS "criadaEm", v."valorTotal"
      FROM vendas v
     WHERE v."empresaId" = ${empresaId}
       AND v."clienteId" IS NOT NULL
       AND ${sqlVendaFaturada}
       ${desde ? Prisma.sql`AND v."criadaEm" >= ${desde}` : Prisma.empty}
       ${clienteIds && clienteIds.length ? Prisma.sql`AND v."clienteId" IN (${Prisma.join(clienteIds)})` : Prisma.empty}
     ORDER BY 2`;
  const mapa = new Map<string, Array<{ data: Date; totalCentavos: number }>>();
  for (const r of rows) {
    const l = mapa.get(r.clienteId) ?? [];
    l.push({ data: new Date(r.criadaEm), totalCentavos: paraCentavos(r.valorTotal) });
    mapa.set(r.clienteId, l);
  }
  return mapa;
}

export interface OficinaRisco {
  id: string;
  nome: string;
  apelido: string | null;
  segmento: string;
  telefone: string | null;
  whatsapp: string | null;
  vendedorResponsavelId: string | null;
  vendedorResponsavelNome: string | null;
  ultimoContatoEm: Date | null;
  churn: ResultadoChurn;
  ticketMedioCentavos: number;
  prioridade: number;
}

export async function carregarOficinasEmRisco(
  empresaId: string,
  opcoes: { incluirAtencao?: boolean; somenteVendedorId?: string } = {},
) {
  const hoje = new Date();
  const clientes = await prisma.cliente.findMany({
    where: {
      empresaId,
      ...filtroB2B,
      ...(opcoes.somenteVendedorId ? { vendedorResponsavelId: opcoes.somenteVendedorId } : {}),
    },
    select: {
      id: true,
      nome: true,
      apelido: true,
      segmento: true,
      telefone: true,
      whatsapp: true,
      vendedorResponsavelId: true,
      ultimoContatoEm: true,
    },
  });
  // 18 meses de histórico bastam para o ritmo (últimas 10 visitas).
  const compras = await comprasPorCliente(empresaId, undefined, new Date(hoje.getTime() - 548 * DIA_MS));
  const vendedores = await prisma.usuario.findMany({
    where: { empresaId },
    select: { id: true, nome: true },
  });
  const nomeVendedor = new Map(vendedores.map((v) => [v.id, v.nome]));

  const lista: OficinaRisco[] = [];
  for (const c of clientes) {
    const vendas = compras.get(c.id) ?? [];
    const churn = avaliarChurn(vendas.map((v) => v.data), hoje);
    const entra = churn.situacao === "EM_RISCO" || (opcoes.incluirAtencao && churn.situacao === "ATENCAO");
    if (!entra) continue;
    const m = metricasCompras(vendas, hoje);
    lista.push({
      ...c,
      segmento: c.segmento,
      vendedorResponsavelNome: c.vendedorResponsavelId ? nomeVendedor.get(c.vendedorResponsavelId) ?? null : null,
      churn,
      ticketMedioCentavos: m.ticketMedioCentavos,
      prioridade: prioridadeRisco(churn),
    });
  }
  lista.sort((a, b) => b.prioridade - a.prioridade);
  return lista;
}

export async function carregarFichaCliente(
  empresaId: string,
  clienteId: string,
  usuario: { id: string; perfil: string },
) {
  const c = await prisma.cliente.findFirst({
    where: { id: clienteId, empresaId },
    include: {
      veiculos: { include: { versao: { include: { modelo: { include: { montadora: true } } } } } },
    },
  });
  if (!c) return null;
  const hoje = new Date();
  const compras = (await comprasPorCliente(empresaId, [c.id])).get(c.id) ?? [];
  const churn = avaliarChurn(compras.map((v) => v.data), hoje);
  const metricas = metricasCompras(compras, hoje);
  const ultimas = await prisma.venda.findMany({
    where: { empresaId, clienteId: c.id, ...filtroVendaFaturada },
    orderBy: { criadaEm: "desc" },
    take: 10,
    select: { id: true, numero: true, criadaEm: true, valorTotal: true, origem: true, _count: { select: { itens: true } } },
  });
  // Categorias que deixou de comprar: compradas antes dos últimos 90 dias e não depois.
  const categorias = await prisma.$queryRaw<Array<{ nome: string; ultima: Date }>>`
    SELECT cp.nome, MAX(COALESCE(v."fechadaEm", v."criadaEm")) AS ultima
      FROM itens_venda iv
      JOIN vendas v ON v.id = iv."vendaId"
      JOIN produtos p ON p.id = iv."produtoId"
      JOIN categorias_peca cp ON cp.id = p."categoriaId"
     WHERE v."empresaId" = ${empresaId} AND v."clienteId" = ${c.id} AND ${sqlVendaFaturada}
     GROUP BY cp.id, cp.nome
    HAVING MAX(COALESCE(v."fechadaEm", v."criadaEm")) < ${new Date(hoje.getTime() - 90 * DIA_MS)}
     ORDER BY ultima DESC
     LIMIT 8`.catch(() => [] as Array<{ nome: string; ultima: Date }>);

  const vendedor = c.vendedorResponsavelId
    ? await prisma.usuario.findFirst({ where: { id: c.vendedorResponsavelId, empresaId }, select: { id: true, nome: true } })
    : null;

  const verCredito = podeVerCredito(usuario, c);
  let credito: null | {
    limiteCentavos: number;
    saldoDevedorCentavos: number;
    disponivelCentavos: number;
    emAtrasoCentavos: number;
    bloqueado: boolean;
  } = null;
  if (verCredito) {
    const atraso = await prisma.contaReceber.aggregate({
      where: {
        empresaId,
        clienteId: c.id,
        status: { in: ["ABERTO", "PARCIALMENTE_PAGO", "ATRASADO"] },
        dataVencimento: { lt: hoje },
      },
      _sum: { valor: true, valorRecebido: true },
    });
    const limite = paraCentavos(c.limiteCredito);
    const saldo = paraCentavos(c.saldoDevedor);
    credito = {
      limiteCentavos: limite,
      saldoDevedorCentavos: saldo,
      disponivelCentavos: Math.max(0, limite - saldo),
      emAtrasoCentavos: paraCentavos(atraso._sum.valor) - paraCentavos(atraso._sum.valorRecebido),
      bloqueado: c.bloqueado,
    };
  }

  return {
    id: c.id,
    nome: c.nome,
    apelido: c.apelido,
    tipo: c.tipo,
    segmento: c.segmento,
    documento: verCredito ? c.cpfCnpj : documentoParcial(c.cpfCnpj),
    telefone: c.telefone,
    whatsapp: c.whatsapp,
    email: c.email,
    municipio: c.municipio,
    uf: c.uf,
    observacoes: c.observacoes,
    prazoPagamentoDias: c.prazoPagamentoDias,
    vendedorResponsavel: vendedor,
    ultimoContatoEm: c.ultimoContatoEm,
    ultimoContatoNota: c.ultimoContatoNota,
    veiculos: c.veiculos.map((v) => ({
      id: v.id,
      placa: v.placa,
      descricao: v.versao ? `${v.versao.modelo.montadora.nome} ${v.versao.modelo.nome} ${v.versao.descricao}` : null,
      ano: v.ano,
    })),
    podeVerCredito: verCredito,
    credito,
    churn,
    metricas,
    ultimasCompras: ultimas.map((u) => ({
      id: u.id,
      numero: u.numero,
      data: u.criadaEm,
      totalCentavos: paraCentavos(u.valorTotal),
      itens: u._count.itens,
      origem: u.origem,
    })),
    categoriasParadas: categorias,
  };
}

// ---------------------------------------------------------------- relatórios
export async function carregarVendasPerdidas(empresaId: string, dias: number) {
  const desde = new Date(Date.now() - dias * DIA_MS);
  const registros = await prisma.vendaPerdida.findMany({
    where: { empresaId, criadoEm: { gte: desde } },
    select: { produtoId: true, descricaoBuscada: true, quantidade: true, motivo: true, criadoEm: true },
  });
  const ids = [...new Set(registros.map((r) => r.produtoId).filter((x): x is string => !!x))];
  const produtos = ids.length
    ? await prisma.produto.findMany({
        where: { empresaId, id: { in: ids } },
        select: { id: true, nome: true, sku: true, estoqueMinimo: true, estoques: { select: { quantidade: true, reservado: true } } },
      })
    : [];
  const mapa = new Map<string, ProdutoEstoque>(
    produtos.map((p) => [
      p.id,
      {
        nome: p.nome,
        sku: p.sku,
        estoqueMinimo: Number(p.estoqueMinimo),
        estoque: p.estoques.reduce((a, e) => a + Number(e.quantidade) - Number(e.reservado), 0),
      },
    ]),
  );
  const grupos = agruparVendasPerdidas(
    registros.map((r) => ({ ...r, quantidade: Number(r.quantidade), motivo: r.motivo as MotivoVendaPerdida })),
    mapa,
  );
  const porMotivo: Record<MotivoVendaPerdida, number> = { SEM_ESTOQUE: 0, PRECO: 0, PRAZO_ENTREGA: 0, NAO_TRABALHAMOS: 0, OUTRO: 0 };
  for (const r of registros) porMotivo[r.motivo as MotivoVendaPerdida]++;
  return { total: registros.length, porMotivo, grupos };
}

export async function carregarEstoqueParado(empresaId: string, minimo: FaixaParado) {
  const produtos = await prisma.produto.findMany({
    where: { empresaId, ativo: true },
    select: {
      id: true,
      sku: true,
      nome: true,
      custoMedio: true,
      criadoEm: true,
      localizacao: true,
      marca: { select: { nome: true } },
      estoques: { select: { quantidade: true } },
    },
  });
  const comSaldo = produtos.filter((p) => p.estoques.reduce((a, e) => a + Number(e.quantidade), 0) > 0);
  const ids = comSaldo.map((p) => p.id);
  const [ultimasVendas, ultimasEntradas] = ids.length
    ? await Promise.all([
        prisma.$queryRaw<Array<{ produtoId: string; ultima: Date }>>`
          SELECT iv."produtoId", MAX(COALESCE(v."fechadaEm", v."criadaEm")) AS ultima
            FROM itens_venda iv JOIN vendas v ON v.id = iv."vendaId"
           WHERE v."empresaId" = ${empresaId} AND ${sqlVendaFaturada}
             AND iv."produtoId" IN (${Prisma.join(ids)})
           GROUP BY iv."produtoId"`,
        prisma.$queryRaw<Array<{ produtoId: string; ultima: Date }>>`
          SELECT m."produtoId", MAX(m."criadoEm") AS ultima
            FROM movimentos_estoque m
           WHERE m."produtoId" IN (${Prisma.join(ids)}) AND m.tipo = 'ENTRADA'
           GROUP BY m."produtoId"`,
      ])
    : [[], []];
  const venda = new Map(ultimasVendas.map((r) => [r.produtoId, new Date(r.ultima)]));
  const entrada = new Map(ultimasEntradas.map((r) => [r.produtoId, new Date(r.ultima)]));
  const porId = new Map(comSaldo.map((p) => [p.id, p]));
  const resultado = estoqueParado(
    comSaldo.map((p) => ({
      produtoId: p.id,
      estoque: p.estoques.reduce((a, e) => a + Number(e.quantidade), 0),
      custoMedio: p.custoMedio,
      ultimaVendaEm: venda.get(p.id) ?? null,
      referenciaSemVenda: entrada.get(p.id) ?? p.criadoEm,
    })),
    minimo,
  );
  return {
    ...resultado,
    lista: resultado.lista.map((i) => {
      const p = porId.get(i.produtoId)!;
      return {
        ...i,
        sku: p.sku,
        nome: p.nome,
        marca: p.marca?.nome ?? null,
        localizacao: p.localizacao,
        estoque: p.estoques.reduce((a, e) => a + Number(e.quantidade), 0),
        ultimaVendaEm: venda.get(p.id) ?? null,
      };
    }),
  };
}

// ---------------------------------------------------------------- painel
export async function carregarIndicadoresBalcao(empresaId: string) {
  const desde7 = new Date(Date.now() - 7 * DIA_MS);
  const [perdidas7, ativos, verificados, revisao, risco] = await Promise.all([
    prisma.vendaPerdida.count({ where: { empresaId, criadoEm: { gte: desde7 } } }),
    prisma.produto.count({ where: { empresaId, ativo: true } }),
    prisma.produto.count({
      where: { empresaId, ativo: true, aplicacaoVerificadaEm: { not: null }, aplicacoes: { some: {} } },
    }),
    prisma.produto.count({ where: { empresaId, ativo: true, revisaoCadastro: true } }),
    carregarOficinasEmRisco(empresaId),
  ]);
  return {
    vendasPerdidas7d: perdidas7,
    pctVerificado: ativos ? Math.round((verificados / ativos) * 100) : 0,
    produtosEmRevisao: revisao,
    oficinasEmRisco: risco.length,
    oficinasContatadas7d: risco.filter((r) => r.ultimoContatoEm && r.ultimoContatoEm >= desde7).length,
  };
}
