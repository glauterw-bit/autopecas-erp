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

import { prisma } from "../db";
import { ApiError } from "../auth/guard";
import { centavosParaReais, reaisParaCentavos } from "../fiscal/centavos";
import { destinatarioDoCliente, emitenteDaEmpresa, enviarFocus, numeroProvisorio, statusDaResposta, type RetratoFiscalItem } from "./emissor";
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

  for (const { original: o, quantidade } of opts.itens) {
    const rotulo = `${o.sku} (${o.nome})`;
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

  const porId = new Map(venda.itens.map((i) => [i.id, i]));
  const selecionados: Array<{ original: ItemOriginal; quantidade: number }> = [];
  for (const pedido of opts.itens) {
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

  const ref = `devolucao-${opts.rmaId ?? venda.id}-${Date.now()}`;
  const { cfg, http, data } = await enviarFocus({ empresa: venda.empresa, modelo: "55", ref, payload: montada.payload });
  const st = statusDaResposta(http, data);
  const t = montada.totais;
  const numero = Number(data.numero) || (await numeroProvisorio(venda.empresaId));

  const nota = await prisma.$transaction(async (tx) => {
    const criada = await tx.notaFiscal.create({
      data: {
        empresaId: venda.empresaId,
        clienteId: venda.clienteId,
        modelo: "NFE_55",
        serie: cfg.serieNfe,
        numero,
        ambiente: cfg.ambiente === "producao" ? "PRODUCAO" : "HOMOLOGACAO",
        naturezaOperacao: "DEVOLUCAO DE VENDA",
        refProvedor: ref,
        finalidade: 4,
        tipoDocumento: 0,
        chaveReferenciada: original.chaveAcesso,
        valorProdutos: centavosParaReais(t.produtosCentavos),
        valorDesconto: centavosParaReais(t.descontoCentavos),
        valorIcms: centavosParaReais(t.icmsCentavos),
        valorPis: centavosParaReais(t.pisCentavos),
        valorCofins: centavosParaReais(t.cofinsCentavos),
        valorIbs: centavosParaReais(t.ibsCentavos),
        valorCbs: centavosParaReais(t.cbsCentavos),
        valorTotal: centavosParaReais(t.totalCentavos),
        status: st.status,
        mensagemSefaz: st.mensagem,
        chaveAcesso: data.chave_nfe ?? null,
        protocolo: data.protocolo ?? null,
        xmlAutorizado: data.xml ?? null,
        danfeUrl: data.url_danfe ?? null,
      },
    });
    if (st.status === "REJEITADA" || st.status === "DENEGADA") return criada;
    for (const pedido of opts.itens) {
      await tx.itemVenda.update({
        where: { id: pedido.itemVendaId },
        data: { quantidadeDevolvidaNota: { increment: pedido.quantidade } },
      });
    }
    if (opts.rmaId) {
      await tx.solicitacaoRMA.updateMany({
        where: { id: opts.rmaId, empresaId: opts.empresaId },
        data: { notaDevolucaoId: criada.id },
      });
    }
    return criada;
  });

  if (st.status === "REJEITADA" || st.status === "DENEGADA") {
    throw new ApiError(422, `A SEFAZ/Focus recusou a devolução: ${st.mensagem}`);
  }
  return nota;
}
