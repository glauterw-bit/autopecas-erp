// Relatório de conferência
// ========================
// O dono confere a migração por números que ele reconhece: quantos produtos,
// quantas peças em estoque, quanto vale o estoque a custo e quanto há a receber.
// A conferência compara o que veio da origem com o que ficou gravado no ERP.
import type { Entidade } from "./tipos";
import { ROTULO_DETALHE, ROTULO_ENTIDADE } from "./tipos";
import type { DadosPorEntidade, RegistroValidado } from "./validar";
import { Decimal, type Dec, centavosParaTexto, paraCentavos } from "./normalizar";
import { gerarCsv } from "./csv";

export type Totais = {
  registros: number;
  quantidade?: string; // soma de estoque (3 casas)
  valorCustoCentavos?: number; // estoque × custo
  valorAbertoCentavos?: number; // contas a receber em aberto
};

export type Conferencia = {
  entidade: Entidade;
  linhasLidas: number;
  validas: number;
  comErro: number;
  comAviso: number;
  totais: Totais;
  detalhes: Record<string, number | string>; // contagens específicas da entidade
  porDeposito?: { deposito: string; itens: number; quantidade: string; valorCustoCentavos: number }[];
};

export type Problema = {
  linha: number;
  ref?: string;
  chave: string;
  tipo: "erro" | "aviso";
  mensagem: string;
};

export type ResultadoImportacao = {
  loteId?: string;
  entidade: Entidade;
  origem: string;
  simulacao: boolean;
  status: "SIMULADO" | "APLICADO" | "ERRO";
  plano: { criar: number; atualizar: number; iguais: number; bloqueados: number; comErro: number };
  conferencia: Conferencia;
  destino?: Totais;
  bate?: boolean;
  diferencas: string[];
  novosDepositos: string[];
  problemas: Problema[];
  mensagemErro?: string;
  duracaoMs: number;
};

const q3 = (d: Dec) => d.toFixed(3);

export function conferirOrigem<E extends Entidade>(
  entidade: E,
  registros: RegistroValidado<DadosPorEntidade[E]>[],
  opcoes: { custoPorSku?: Map<string, Dec>; depositoPadrao?: string } = {},
): Conferencia {
  const validos = registros.filter((r) => r.dados);
  const base: Conferencia = {
    entidade,
    linhasLidas: registros.length,
    validas: validos.length,
    comErro: registros.length - validos.length,
    comAviso: registros.filter((r) => r.avisos.length > 0).length,
    totais: { registros: validos.length },
    detalhes: {},
  };

  if (entidade === "PRODUTO") {
    const ps = validos.map((r) => r.dados as DadosPorEntidade["PRODUTO"]);
    base.detalhes = {
      semNcm: ps.filter((p) => !p.ncm).length,
      semEan: ps.filter((p) => !p.codigoBarras).length,
      semMarca: ps.filter((p) => !p.marca).length,
      semCodigoFabricante: ps.filter((p) => !p.codigoFabricante).length,
      semPrecoVenda: ps.filter((p) => !p.precoVenda || p.precoVenda.isZero()).length,
      semCusto: ps.filter((p) => !p.custo || p.custo.isZero()).length,
      inativos: ps.filter((p) => p.ativo === false).length,
    };
  } else if (entidade === "ESTOQUE") {
    const es = validos.map((r) => r.dados as DadosPorEntidade["ESTOQUE"]);
    let qtd = new Decimal(0);
    let valor = new Decimal(0);
    let semCusto = 0;
    const porDep = new Map<string, { itens: number; q: Dec; v: Dec }>();
    for (const e of es) {
      const custo = e.custo ?? opcoes.custoPorSku?.get(e.sku);
      if (!custo || custo.isZero()) semCusto++;
      const v = e.quantidade.mul(custo ?? 0);
      qtd = qtd.add(e.quantidade);
      valor = valor.add(v);
      const dep = e.deposito ?? opcoes.depositoPadrao ?? "(padrão)";
      const acc = porDep.get(dep) ?? { itens: 0, q: new Decimal(0), v: new Decimal(0) };
      acc.itens++;
      acc.q = acc.q.add(e.quantidade);
      acc.v = acc.v.add(v);
      porDep.set(dep, acc);
    }
    base.totais.quantidade = q3(qtd);
    base.totais.valorCustoCentavos = paraCentavos(valor);
    base.detalhes = {
      itensComSaldo: es.filter((e) => e.quantidade.gt(0)).length,
      itensZerados: es.filter((e) => e.quantidade.isZero()).length,
      negativosZerados: registros.filter((r) => r.avisos.some((a) => a.startsWith("Estoque negativo"))).length,
      semCusto,
    };
    base.porDeposito = [...porDep.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([deposito, a]) => ({ deposito, itens: a.itens, quantidade: q3(a.q), valorCustoCentavos: paraCentavos(a.v) }));
  } else if (entidade === "PRECO") {
    const ps = validos.map((r) => r.dados as DadosPorEntidade["PRECO"]);
    base.detalhes = {
      comPrecoVenda: ps.filter((p) => p.precoVenda).length,
      comPrecoMinimo: ps.filter((p) => p.precoMinimo).length,
      comCusto: ps.filter((p) => p.custo).length,
    };
  } else if (entidade === "CLIENTE") {
    const cs = validos.map((r) => r.dados as DadosPorEntidade["CLIENTE"]);
    base.detalhes = {
      pf: cs.filter((c) => c.tipo === "PF").length,
      pj: cs.filter((c) => c.tipo === "PJ").length,
      semDocumento: cs.filter((c) => !c.cpfCnpj).length,
      semTelefone: cs.filter((c) => !c.telefone && !c.whatsapp).length,
    };
  } else if (entidade === "FORNECEDOR") {
    const fs = validos.map((r) => r.dados as DadosPorEntidade["FORNECEDOR"]);
    base.detalhes = { inativos: fs.filter((f) => f.ativo === false).length };
  } else if (entidade === "CONTA_RECEBER") {
    const cs = validos.map((r) => r.dados as DadosPorEntidade["CONTA_RECEBER"]);
    const hoje = new Date();
    let total = 0;
    let vencido = 0;
    for (const c of cs) {
      const cent = paraCentavos(c.valor);
      total += cent;
      if (c.dataVencimento < hoje) vencido += cent;
    }
    base.totais.valorAbertoCentavos = total;
    base.detalhes = {
      titulosVencidos: cs.filter((c) => c.dataVencimento < hoje).length,
      valorVencido: centavosParaTexto(vencido),
      clientesDistintos: new Set(cs.map((c) => c.clienteCodigo ?? c.clienteCpfCnpj)).size,
    };
  }
  return base;
}

// Compara origem × destino. Diferença em centavos ou peças é mostrada, nunca escondida.
export function compararTotais(origem: Totais, destino: Totais): string[] {
  const dif: string[] = [];
  if (origem.registros !== destino.registros)
    dif.push(`Registros: origem ${origem.registros}, gravados ${destino.registros}`);
  if (origem.quantidade !== undefined && origem.quantidade !== destino.quantidade)
    dif.push(`Quantidade em estoque: origem ${origem.quantidade}, gravado ${destino.quantidade ?? "—"}`);
  if (origem.valorCustoCentavos !== undefined && origem.valorCustoCentavos !== destino.valorCustoCentavos)
    dif.push(
      `Valor do estoque a custo: origem ${centavosParaTexto(origem.valorCustoCentavos)}, gravado ${
        destino.valorCustoCentavos === undefined ? "—" : centavosParaTexto(destino.valorCustoCentavos)
      }`,
    );
  if (origem.valorAbertoCentavos !== undefined && origem.valorAbertoCentavos !== destino.valorAbertoCentavos)
    dif.push(
      `Contas em aberto: origem ${centavosParaTexto(origem.valorAbertoCentavos)}, gravado ${
        destino.valorAbertoCentavos === undefined ? "—" : centavosParaTexto(destino.valorAbertoCentavos)
      }`,
    );
  return dif;
}


function linhasTotais(t: Totais): string[] {
  const out = [`  registros: ${t.registros}`];
  if (t.quantidade !== undefined) out.push(`  quantidade em estoque: ${t.quantidade}`);
  if (t.valorCustoCentavos !== undefined) out.push(`  valor do estoque a custo: ${centavosParaTexto(t.valorCustoCentavos)}`);
  if (t.valorAbertoCentavos !== undefined) out.push(`  contas em aberto: ${centavosParaTexto(t.valorAbertoCentavos)}`);
  return out;
}

// Texto para terminal e para o topo do CSV.
export function formatarRelatorio(r: ResultadoImportacao): string {
  const c = r.conferencia;
  const out: string[] = [];
  out.push(`== ${ROTULO_ENTIDADE[r.entidade]} (${r.origem}) — ${r.simulacao ? "SIMULAÇÃO, nada gravado" : r.status} ==`);
  out.push(`Linhas lidas: ${c.linhasLidas} | válidas: ${c.validas} | com erro: ${c.comErro} | com aviso: ${c.comAviso}`);
  out.push(
    `Plano: criar ${r.plano.criar} | atualizar ${r.plano.atualizar} | sem mudança ${r.plano.iguais} | bloqueados ${r.plano.bloqueados} | com erro ${r.plano.comErro}`,
  );
  if (r.novosDepositos.length) out.push(`Depósitos novos: ${r.novosDepositos.join(", ")}`);
  out.push("Origem:");
  out.push(...linhasTotais(c.totais));
  for (const [k, v] of Object.entries(c.detalhes)) out.push(`  ${ROTULO_DETALHE[k] ?? k}: ${v}`);
  for (const d of c.porDeposito ?? [])
    out.push(`  depósito ${d.deposito}: ${d.itens} itens, ${d.quantidade} peças, ${centavosParaTexto(d.valorCustoCentavos)} a custo`);
  if (r.destino) {
    out.push("Gravado no ERP:");
    out.push(...linhasTotais(r.destino));
    out.push(r.bate ? "Conferência: BATE" : "Conferência: NÃO BATE");
    for (const d of r.diferencas) out.push(`  - ${d}`);
  }
  if (r.mensagemErro) out.push(`ERRO: ${r.mensagemErro}`);
  const erros = r.problemas.filter((p) => p.tipo === "erro");
  if (erros.length) {
    out.push(`Primeiros erros (${erros.length} no total):`);
    for (const p of erros.slice(0, 10)) out.push(`  ${p.ref ?? `linha ${p.linha}`}: ${p.mensagem}`);
  }
  return out.join("\n");
}

export function relatorioCsv(r: ResultadoImportacao): string {
  const linhas: (string | number | null | undefined)[][] = [];
  for (const l of formatarRelatorio(r).split("\n")) linhas.push([l]);
  linhas.push([]);
  linhas.push(["linha", "referência", "chave", "tipo", "mensagem"]);
  for (const p of r.problemas) linhas.push([p.linha, p.ref ?? "", p.chave, p.tipo, p.mensagem]);
  return gerarCsv(linhas);
}
