// NF-e de devolução de venda (entrada) referenciando a nota original por item
// =========================================================================
// Desde 03/11/2026 a devolução precisa levar, em cada item, a chave da nota
// original e o número do item (grupo DFeReferenciado), além do refNFe da nota.
// Sem isso: Rejeição 321. Fonte: NT 2025.002-RTC (https://www.nfe.fazenda.gov.br/portal/),
// resumo https://www.tax360.com.br/conteudo/nt-nfe-nfce-2025-002-rtc-v152
//
// Quem emite: a loja, NF-e modelo 55 de ENTRADA (tpNF 0), finalidade 4.
// A tributação espelha a do item original (inclusive CST 60/CSOSN 500 se a
// venda foi feita com ST antes de 01/10/2026), com CFOP de devolução:
//   5102→1202, 6102→2202 (mercadoria de terceiros)
//   5405/5403→1411, 6403/6404→2411 (mercadoria de terceiros com ST)
// Tabela CFOP — Convênio s/nº de 1970, Anexo (Ajuste SINIEF 07/01 e alterações):
//   https://www.confaz.fazenda.gov.br/legislacao/ajustes/2001/AJ_007_01
// CFOP original fora desta tabela → bloqueia (o contador decide).

import { createHash } from "node:crypto";
import { Prisma, type NotaFiscal } from "@prisma/client";
import { prisma } from "../db";
import { ApiError } from "../auth/guard";
import { centavosParaReais, reaisParaCentavos } from "../fiscal/centavos";
import { configFocusComToken, exigirProntidaoFiscal, destinatarioDoCliente, emitenteDaEmpresa, enviarFocus, numeroProvisorio, statusDaResposta, type RetratoFiscalItem } from "./emissor";
import { liberarReservaDevolucao } from "./sincronizar";
import { montarNota, type DadosNota, type ItemEntradaNota } from "./payload";
import { itensDoXmlNfe } from "./xml-nfe";

export const CFOP_DEVOLUCAO: Record<string, string> = {
  "5102": "1202",
  "6102": "2202",
  "5405": "1411",
  "5403": "1411",
  "6403": "2411",
  "6404": "2411",
};

export function cfopDevolucao(cfopOriginal: string | null | undefined): string | null {
  return CFOP_DEVOLUCAO[(cfopOriginal ?? "").trim()] ?? null;
}

export interface ItemOriginal {
  itemVendaId: string;
  sku: string;
  nome: string;
  codigoBarras?: string | null;
  unidade: string;
  quantidadeVendida: number | string;
  quantidadeJaDevolvida: number | string;
  precoUnitario: number | string;
  descontoCentavos: number;
  numeroItemNota: number | null;
  retrato: Partial<RetratoFiscalItem> | null;
  /** Dados atuais do produto, só para NCM/CEST/origem quando o retrato não tem. */
  produto: { ncm?: string | null; cest?: string | null; origemFiscal: number };
}

/**
 * Monta os itens da devolução (puro). Para notas antigas sem nItem/retrato
 * gravados, usa o XML autorizado da nota original (casando pelo código do produto).
 */
export function montarItensDevolucao(opts: {
  chaveOriginal: string;
  xmlOriginal?: string | null;
  itens: Array<{ original: ItemOriginal; quantidade: number }>;
}): { itens: ItemEntradaNota[]; erros: string[] } {
  const erros: string[] = [];
  const xmlItens = opts.xmlOriginal ? itensDoXmlNfe(opts.xmlOriginal) : [];
  const itens: ItemEntradaNota[] = [];

  const vistos = new Set<string>();
  for (const { original: o, quantidade } of opts.itens) {
    const rotulo = `${o.sku} (${o.nome})`;
    if (vistos.has(o.itemVendaId)) {
      erros.push(`${rotulo}: o mesmo item aparece mais de uma vez no pedido; junte as quantidades numa linha só.`);
      continue;
    }
    vistos.add(o.itemVendaId);
    const vendida = Number(o.quantidadeVendida);
    const disponivel = vendida - Number(o.quantidadeJaDevolvida);
    if (!(quantidade > 0)) {
      erros.push(`${rotulo}: quantidade a devolver precisa ser maior que zero.`);
      continue;
    }
    if (quantidade > disponivel + 1e-9) {
      erros.push(`${rotulo}: só ${disponivel} unidade(s) podem ser devolvidas nesta nota.`);
      continue;
    }

    let nItem = o.numeroItemNota;
    let r: Partial<RetratoFiscalItem> | null = o.retrato;
    if (nItem == null || !r?.cfop) {
      const candidatos = xmlItens.filter((x) => x.cProd === o.sku);
      if (candidatos.length !== 1) {
        erros.push(
          `${rotulo}: não foi possível achar o item na nota original (${candidatos.length === 0 ? "não está no XML" : "aparece mais de uma vez"}). ` +
            `Emita esta devolução com o contador.`,
        );
        continue;
      }
      const x = candidatos[0];
      nItem = nItem ?? x.nItem;
      r = r?.cfop ? r : { cfop: x.cfop ?? undefined, cstIcms: x.cstIcms ?? undefined, aliquotaIcms: x.pIcms ?? 0, cstPis: x.cstPis ?? undefined, cstCofins: x.cstCofins ?? undefined, ncm: x.ncm, cest: x.cest };
    }

    const cfop = cfopDevolucao(r?.cfop);
    if (!cfop) {
      erros.push(`${rotulo}: a venda saiu com CFOP ${r?.cfop ?? "(vazio)"}, sem devolução automática definida. Fale com o contador.`);
      continue;
    }

    itens.push({
      sku: o.sku,
      codigoBarras: o.codigoBarras,
      nome: o.nome,
      ncm: r?.ncm ?? o.produto.ncm,
      cest: r?.cest ?? o.produto.cest,
      unidade: o.unidade,
      quantidade,
      valorUnitario: o.precoUnitario,
      // desconto proporcional à quantidade devolvida, em centavos
      descontoCentavos: vendida > 0 ? Math.round((o.descontoCentavos * quantidade) / vendida) : 0,
      origem: r?.origem ?? o.produto.origemFiscal,
      cstIcms: r?.cstIcms ?? null,
      cfopFixo: cfop,
      aliquotaIcms: r?.aliquotaIcms || null,
      monofasico: r?.monofasico ?? null,
      cstPis: r?.cstPis ?? null,
      cstCofins: r?.cstCofins ?? null,
      pisAliquota: r?.pisAliquota || null,
      cofinsAliquota: r?.cofinsAliquota || null,
      cstIbsCbs: r?.cstIbsCbs ?? null,
      cClassTrib: r?.cClassTrib ?? null,
      referencia: { chave: opts.chaveOriginal, nItem: nItem! },
    });
  }
  return { itens, erros };
}

/** Junta pedidos repetidos do mesmo item (soma em milésimos) e ordena por id. */
export function agruparPedidos(
  itens: Array<{ itemVendaId: string; quantidade: number }>,
): Array<{ itemVendaId: string; quantidade: number }> {
  const m = new Map<string, number>();
  for (const it of itens) {
    m.set(it.itemVendaId, (m.get(it.itemVendaId) ?? 0) + Math.round(Number(it.quantidade) * 1000));
  }
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([itemVendaId, mil]) => ({ itemVendaId, quantidade: mil / 1000 }));
}

/**
 * Referência na Focus determinística para o pedido de devolução: a mesma
 * venda/RMA, os mesmos itens e quantidades, partindo do mesmo "já devolvido",
 * geram sempre o mesmo ref. Repetir o pedido (duplo clique, nova tentativa
 * depois de queda) não cria outra nota; uma segunda devolução parcial legítima
 * parte de outro "já devolvido" e ganha outro ref.
 */
export function refDevolucao(opts: {
  empresaId: string;
  vendaId: string;
  rmaId?: string;
  itens: Array<{ itemVendaId: string; quantidade: number; jaDevolvidoAntes: number | string }>;
}): string {
  const partes = [...opts.itens]
    .sort((a, b) => a.itemVendaId.localeCompare(b.itemVendaId))
    .map((i) => `${i.itemVendaId}:${Math.round(Number(i.quantidade) * 1000)}:${Math.round(Number(i.jaDevolvidoAntes) * 1000)}`);
  const base = [opts.empresaId, opts.vendaId, opts.rmaId ?? "", ...partes].join("|");
  return `devolucao-${createHash("sha256").update(base).digest("hex").slice(0, 32)}`;
}

export async function emitirNotaDevolucao(opts: {
  empresaId: string;
  vendaId: string;
  itens: Array<{ itemVendaId: string; quantidade: number }>;
  rmaId?: string;
}) {
  const venda = await prisma.venda.findFirst({
    where: { id: opts.vendaId, empresaId: opts.empresaId },
    include: {
      empresa: true,
      cliente: true,
      notaFiscal: true,
      itens: { include: { produto: true } },
    },
  });
  if (!venda) throw new ApiError(404, "Venda não encontrada");
  const original = venda.notaFiscal;
  if (!original || original.status !== "AUTORIZADA" || !original.chaveAcesso) {
    throw new ApiError(422, "A venda não tem nota autorizada com chave de acesso; não há o que referenciar na devolução.");
  }
  if (!venda.cliente) {
    throw new ApiError(422, "Cadastre o cliente (CPF/CNPJ e endereço) na venda antes de emitir a NF-e de devolução.");
  }
  // Sem token ou com configuração fiscal incompleta não grava nada (nem reserva, nem nota).
  exigirProntidaoFiscal(venda.empresa, "55");
  configFocusComToken(venda.empresa);

  // O mesmo item pedido duas vezes vira uma linha só, com a soma.
  const pedidos = agruparPedidos(opts.itens);
  const porId = new Map(venda.itens.map((i) => [i.id, i]));
  const selecionados: Array<{ original: ItemOriginal; quantidade: number }> = [];
  for (const pedido of pedidos) {
    const iv = porId.get(pedido.itemVendaId);
    if (!iv) throw new ApiError(404, "Item da venda não encontrado");
    selecionados.push({
      quantidade: pedido.quantidade,
      original: {
        itemVendaId: iv.id,
        sku: iv.produto.sku,
        nome: iv.produto.nome,
        codigoBarras: iv.produto.codigoBarras,
        unidade: iv.produto.unidade,
        quantidadeVendida: iv.quantidade.toString(),
        quantidadeJaDevolvida: iv.quantidadeDevolvidaNota.toString(),
        precoUnitario: iv.precoUnitario.toString(),
        descontoCentavos: reaisParaCentavos(iv.desconto),
        numeroItemNota: iv.numeroItemNota,
        retrato: (iv.fiscalNota ?? null) as Partial<RetratoFiscalItem> | null,
        produto: { ncm: iv.produto.ncm, cest: iv.produto.cest, origemFiscal: iv.produto.origemFiscal },
      },
    });
  }

  // Clique duplo: só reaproveita uma nota EMITINDO se for do MESMO pedido.
  // - Com rmaId: a nota já ligada a esse RMA.
  // - Sem rmaId: nota sem RMA ligado cujo ref bate com o ref refeito a partir
  //   do "já devolvido" de antes da reserva (já devolvido atual - pedido).
  // Qualquer outra nota em voo (balcão x RMA, duas devoluções de 1 unidade)
  // não é reaproveitada: segue o fluxo normal, com a validação de saldo.
  const emVoo = await prisma.notaFiscal.findMany({
    where: { empresaId: venda.empresaId, finalidade: 4, status: "EMITINDO", chaveReferenciada: original.chaveAcesso },
  });
  if (emVoo.length) {
    if (opts.rmaId) {
      const r = await prisma.solicitacaoRMA.findFirst({
        where: { id: opts.rmaId, empresaId: opts.empresaId },
        select: { notaDevolucaoId: true },
      });
      const mesma = emVoo.find((n) => n.id === r?.notaDevolucaoId);
      if (mesma) return mesma;
    } else {
      const comRma = await prisma.solicitacaoRMA.findMany({
        where: { empresaId: opts.empresaId, notaDevolucaoId: { in: emVoo.map((n) => n.id) } },
        select: { notaDevolucaoId: true },
      });
      const ligadas = new Set(comRma.map((x) => x.notaDevolucaoId));
      const refAntes = refDevolucao({
        empresaId: venda.empresaId,
        vendaId: venda.id,
        itens: selecionados.map((x) => ({
          itemVendaId: x.original.itemVendaId,
          quantidade: x.quantidade,
          jaDevolvidoAntes: Number(x.original.quantidadeJaDevolvida) - x.quantidade,
        })),
      });
      const mesma = emVoo.find((n) => !ligadas.has(n.id) && n.refProvedor === refAntes);
      if (mesma) return mesma;
    }
  }

  const { itens, erros } = montarItensDevolucao({
    chaveOriginal: original.chaveAcesso,
    xmlOriginal: original.xmlAutorizado,
    itens: selecionados,
  });
  if (erros.length) throw new ApiError(422, `Devolução bloqueada:\n- ${erros.join("\n- ")}`);

  const dados: DadosNota = {
    modelo: "55",
    finalidade: 4,
    tipoDocumento: 0,
    natureza: "DEVOLUCAO DE VENDA",
    dataEmissao: new Date(),
    emitente: emitenteDaEmpresa(venda.empresa),
    destinatario: destinatarioDoCliente(venda.cliente),
    itens,
    pagamentos: [],
    presenca: "NAO_SE_APLICA",
    notasReferenciadas: [original.chaveAcesso],
  };
  const montada = montarNota(dados);
  if (!montada.ok) throw new ApiError(422, `Devolução bloqueada:\n- ${montada.erros.join("\n- ")}`);

  const ref = refDevolucao({
    empresaId: venda.empresaId,
    vendaId: venda.id,
    rmaId: opts.rmaId,
    itens: selecionados.map((x) => ({
      itemVendaId: x.original.itemVendaId,
      quantidade: x.quantidade,
      jaDevolvidoAntes: x.original.quantidadeJaDevolvida,
    })),
  });

  // Mesmo pedido já em andamento ou autorizado: devolve a nota que existe.
  const existente = await prisma.notaFiscal.findFirst({
    where: { empresaId: venda.empresaId, refProvedor: ref, status: { in: ["EMITINDO", "AUTORIZADA"] } },
  });
  if (existente) return existente;

  const cfg = configFocusComToken(venda.empresa);
  const t = montada.totais;
  const reservados = pedidos.map((p) => ({ itemVendaId: p.itemVendaId, quantidade: p.quantidade }));
  const numeroTemp = await numeroProvisorio(venda.empresaId);

  // 1) Reserva + nota EMITINDO + liga o RMA, numa transação, ANTES da Focus.
  const resultado = await prisma.$transaction(async (tx) => {
    for (const x of selecionados) {
      const q = new Prisma.Decimal(x.quantidade);
      const ja = new Prisma.Decimal(x.original.quantidadeJaDevolvida);
      // Condicional: só reserva se ninguém mexeu desde a leitura e se cabe.
      const n = await tx.$executeRaw`
        UPDATE itens_venda
           SET "quantidadeDevolvidaNota" = "quantidadeDevolvidaNota" + ${q}
         WHERE id = ${x.original.itemVendaId}
           AND "vendaId" = ${venda.id}
           AND "quantidadeDevolvidaNota" = ${ja}
           AND "quantidadeDevolvidaNota" + ${q} <= quantidade`;
      if (n === 0) throw new ConflitoReserva();
    }
    const criada = await tx.notaFiscal.create({
      data: {
        empresaId: venda.empresaId,
        clienteId: venda.clienteId,
        modelo: "NFE_55",
        serie: cfg.serieNfe,
        numero: numeroTemp,
        ambiente: cfg.ambiente === "producao" ? "PRODUCAO" : "HOMOLOGACAO",
        naturezaOperacao: "DEVOLUCAO DE VENDA",
        refProvedor: ref,
        finalidade: 4,
        tipoDocumento: 0,
        chaveReferenciada: original.chaveAcesso,
        devolucaoItens: reservados,
        valorProdutos: centavosParaReais(t.produtosCentavos),
        valorDesconto: centavosParaReais(t.descontoCentavos),
        valorIcms: centavosParaReais(t.icmsCentavos),
        valorPis: centavosParaReais(t.pisCentavos),
        valorCofins: centavosParaReais(t.cofinsCentavos),
        valorIbs: centavosParaReais(t.ibsCentavos),
        valorCbs: centavosParaReais(t.cbsCentavos),
        valorTotal: centavosParaReais(t.totalCentavos),
        status: "EMITINDO",
      },
    });
    if (opts.rmaId) {
      // Dentro da transação: só liga se o RMA ainda não tem nota (dois cliques → uma nota).
      const r = await tx.solicitacaoRMA.updateMany({
        where: { id: opts.rmaId, empresaId: opts.empresaId, notaDevolucaoId: null },
        data: { notaDevolucaoId: criada.id },
      });
      if (r.count === 0) throw new ApiError(422, "Este RMA já tem nota de devolução");
    }
    return { nota: criada, nova: true as const };
  }).catch(async (e): Promise<{ nota: NotaFiscal; nova: false }> => {
    if (e instanceof ConflitoReserva) {
      // Duplo clique: a outra chamada já reservou com este mesmo ref.
      const outra = await prisma.notaFiscal.findFirst({
        where: { empresaId: venda.empresaId, refProvedor: ref, status: { in: ["EMITINDO", "AUTORIZADA"] } },
      });
      if (outra) return { nota: outra, nova: false };
      throw new ApiError(409, "Outra devolução deste item foi registrada agora. Recarregue a venda e confira o saldo.");
    }
    throw e;
  });
  if (!resultado.nova) return resultado.nota;
  const reserva = resultado.nota;

  // 2) Envia. Sem resposta (queda de rede): a nota fica EMITINDO e a consulta
  //    (job/botão) decide; se a Focus não a tiver, a reserva é devolvida lá.
  let http: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: Record<string, any>;
  try {
    ({ http, data } = await enviarFocus({ empresa: venda.empresa, modelo: "55", ref, payload: montada.payload }));
  } catch {
    return prisma.notaFiscal.update({
      where: { id: reserva.id },
      data: { mensagemSefaz: "Sem resposta da Focus NFe no envio. Use \"Atualizar situação\" em alguns minutos." },
    });
  }
  const st = statusDaResposta(http, data);

  // 3) Recusou ou deu erro: devolve a reserva e desliga o RMA.
  if (st.status === "REJEITADA" || st.status === "DENEGADA") {
    await prisma.$transaction(async (tx) => {
      const r = await tx.notaFiscal.updateMany({
        where: { id: reserva.id, status: "EMITINDO" },
        data: { status: st.status, mensagemSefaz: st.mensagem },
      });
      if (r.count) await liberarReservaDevolucao(tx, reserva);
    });
    throw new ApiError(422, `A SEFAZ/Focus recusou a devolução: ${st.mensagem}`);
  }

  // 4) Autorizada na hora ou ainda processando (o normal na NF-e 55).
  return prisma.notaFiscal.update({
    where: { id: reserva.id },
    data: {
      status: st.status,
      mensagemSefaz: st.mensagem,
      ...(Number(data.numero) ? { numero: Number(data.numero) } : {}),
      chaveAcesso: data.chave_nfe ?? null,
      protocolo: data.protocolo ?? null,
      xmlAutorizado: data.xml ?? null,
      danfeUrl: data.url_danfe ?? null,
      ...(st.status === "AUTORIZADA" ? { dataAutorizacao: new Date() } : {}),
    },
  });
}

class ConflitoReserva extends Error {}
