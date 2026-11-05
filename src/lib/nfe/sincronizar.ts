import axios from "axios";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { ApiError } from "../auth/guard";
import { FOCUS_BASE } from "./config-focus";
import { configFocusComToken } from "./emissor";

// Situação da nota na Focus NFe (consulta)
// ========================================
// A NF-e modelo 55 é assíncrona: o envio responde "processando_autorizacao" e o
// resultado da SEFAZ chega depois. Esta função consulta e grava o resultado.
//
// Doc oficial (consultada em 04/11/2026):
//   https://doc.focusnfe.com.br/reference/consultar_nfe
//   GET {base}/v2/nfe/{referencia}?completa=1 (NFC-e: /v2/nfce/{referencia}),
//   HTTP Basic com o token como usuário e senha vazia.
//   status: processando_autorizacao | autorizado | cancelado | erro_autorizacao
//   (o envio também pode responder "denegado").
//   Campos: chave_nfe, numero, serie, status_sefaz, mensagem_sefaz,
//   caminho_xml_nota_fiscal, caminho_danfe (caminhos relativos ao servidor),
//   erros[] (codigo, mensagem). Com completa=1 vem protocolo_nota_fiscal
//   (numero_protocolo, data_recebimento) — usado se estiver presente.
//   404 { codigo: "nao_encontrado" }: a Focus não tem nota com essa referência.
//
// Idempotente: só mexe em nota EMITINDO, e a troca de status é condicional
// (updateMany onde status = EMITINDO), então job, botão e webhook podem rodar
// juntos sem aplicar o resultado duas vezes.
//
// Se a SEFAZ recusar:
//  - nota de venda: a venda volta de FATURADA para PAGA e perde o notaFiscalId
//    (e o nItem/retrato fiscal dos itens), para poder emitir de novo;
//  - nota de devolução: a reserva em ItemVenda.quantidadeDevolvidaNota é
//    devolvida e o RMA é desligado da nota;
//  - grava LogAuditoria com antes e depois.

/** Nota sem resposta da Focus há mais que isto e 404 na consulta = nunca chegou. */
export const MINUTOS_PARA_DAR_COMO_NAO_RECEBIDA = 5;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RespostaFocus = Record<string, any>;

export type ResultadoConsulta =
  | { tipo: "processando" }
  | { tipo: "autorizada"; chave: string | null; numero: number | null; serie: string | null; protocolo: string | null; mensagem: string | null; caminhoXml: string | null; caminhoDanfe: string | null }
  | { tipo: "cancelada"; mensagem: string | null; caminhoXmlCancelamento: string | null }
  | { tipo: "recusada"; status: "REJEITADA" | "DENEGADA"; mensagem: string }
  | { tipo: "nao_encontrada" }
  | { tipo: "falha"; mensagem: string };

/** Interpreta a resposta da consulta (puro, testado). */
export function interpretarConsulta(http: number, data: RespostaFocus): ResultadoConsulta {
  if (http === 404) return { tipo: "nao_encontrada" };
  if (http === 401 || http === 403) return { tipo: "falha", mensagem: "A Focus NFe recusou o token desta empresa (acesso negado)." };
  if (http >= 500 || http === 0) return { tipo: "falha", mensagem: `A Focus NFe não respondeu (HTTP ${http}). Tente de novo em alguns minutos.` };
  if (http >= 400) return { tipo: "falha", mensagem: String(data?.mensagem ?? `Erro HTTP ${http} na consulta`).slice(0, 500) };
  const status = String(data?.status ?? "");
  const msgSefaz = data?.mensagem_sefaz != null ? String(data.mensagem_sefaz) : null;
  const codSefaz = data?.status_sefaz != null ? String(data.status_sefaz) : null;
  const comCodigo = (m: string | null) => (m ? `${codSefaz ? `${codSefaz} - ` : ""}${m}`.slice(0, 500) : null);
  switch (status) {
    case "processando_autorizacao":
      return { tipo: "processando" };
    case "autorizado":
      return {
        tipo: "autorizada",
        chave: data.chave_nfe ? String(data.chave_nfe) : null,
        numero: Number(data.numero) || null,
        serie: data.serie != null ? String(data.serie) : null,
        protocolo: data.protocolo_nota_fiscal?.numero_protocolo ? String(data.protocolo_nota_fiscal.numero_protocolo) : data.protocolo ? String(data.protocolo) : null,
        mensagem: comCodigo(msgSefaz),
        caminhoXml: data.caminho_xml_nota_fiscal ? String(data.caminho_xml_nota_fiscal) : null,
        caminhoDanfe: data.caminho_danfe ? String(data.caminho_danfe) : null,
      };
    case "cancelado":
      return { tipo: "cancelada", mensagem: comCodigo(msgSefaz), caminhoXmlCancelamento: data.caminho_xml_cancelamento ? String(data.caminho_xml_cancelamento) : null };
    case "erro_autorizacao":
    case "denegado": {
      const erros = Array.isArray(data.erros)
        ? data.erros.map((e: { codigo?: unknown; mensagem?: unknown }) => [e?.codigo, e?.mensagem].filter(Boolean).join(" - ")).filter(Boolean)
        : [];
      const mensagem = comCodigo(msgSefaz) ?? (erros.length ? erros.join("; ").slice(0, 500) : "A SEFAZ recusou a nota (sem mensagem).");
      return { tipo: "recusada", status: status === "denegado" ? "DENEGADA" : "REJEITADA", mensagem };
    }
    default:
      return { tipo: "falha", mensagem: `Situação desconhecida na Focus: "${status || "(vazia)"}".` };
  }
}

/** URL absoluta de um caminho relativo da Focus (XML/DANFE). */
export function urlFocus(base: string, caminho: string | null): string | null {
  if (!caminho) return null;
  if (/^https?:\/\//i.test(caminho)) return caminho;
  return `${base}${caminho.startsWith("/") ? "" : "/"}${caminho}`;
}

async function baixarXml(url: string | null, token: string): Promise<string | null> {
  if (!url) return null;
  try {
    const r = await axios.get(url, { auth: { username: token, password: "" }, responseType: "text", validateStatus: () => true, timeout: 20_000 });
    return r.status === 200 && typeof r.data === "string" && r.data.includes("<") ? r.data : null;
  } catch {
    return null;
  }
}

export interface ResultadoSincronizacao {
  notaId: string;
  status: string;
  mudou: boolean;
  mensagem: string | null;
}

/**
 * Consulta a nota na Focus e grava o resultado. `empresaId` (da sessão) restringe
 * à empresa; o job passa sem empresaId e a nota é buscada pelo id.
 */
export async function sincronizarNota(
  notaId: string,
  opts: { empresaId?: string; usuarioId?: string | null; agora?: Date } = {},
): Promise<ResultadoSincronizacao> {
  const nota = await prisma.notaFiscal.findFirst({
    where: { id: notaId, ...(opts.empresaId ? { empresaId: opts.empresaId } : {}) },
    include: { empresa: { select: { cnpj: true, configuracoes: true } } },
  });
  if (!nota) throw new ApiError(404, "Nota fiscal não encontrada");
  if (nota.status !== "EMITINDO") {
    return { notaId: nota.id, status: nota.status, mudou: false, mensagem: nota.mensagemSefaz };
  }
  if (!nota.refProvedor || (nota.modelo !== "NFE_55" && nota.modelo !== "NFCE_65")) {
    return { notaId: nota.id, status: nota.status, mudou: false, mensagem: "Nota sem referência na Focus: confira com o suporte." };
  }

  const cfg = configFocusComToken(nota.empresa);
  const base = FOCUS_BASE[cfg.ambiente];
  const tipo = nota.modelo === "NFCE_65" ? "nfce" : "nfe";
  let http = 0;
  let data: RespostaFocus = {};
  try {
    const r = await axios.get(`${base}/v2/${tipo}/${encodeURIComponent(nota.refProvedor)}?completa=1`, {
      auth: { username: cfg.token, password: "" },
      validateStatus: () => true,
      timeout: 20_000,
    });
    http = r.status;
    data = (r.data ?? {}) as RespostaFocus;
  } catch {
    http = 0;
  }
  let res = interpretarConsulta(http, data);

  if (res.tipo === "nao_encontrada") {
    const idadeMin = ((opts.agora ?? new Date()).getTime() - nota.dataEmissao.getTime()) / 60_000;
    if (idadeMin < MINUTOS_PARA_DAR_COMO_NAO_RECEBIDA) {
      return { notaId: nota.id, status: nota.status, mudou: false, mensagem: "A Focus ainda não registrou esta nota. Consulte de novo em alguns minutos." };
    }
    res = { tipo: "recusada", status: "REJEITADA", mensagem: "A Focus NFe não recebeu esta nota (referência não encontrada). Emita de novo." };
  }
  if (res.tipo === "processando") {
    return { notaId: nota.id, status: nota.status, mudou: false, mensagem: "A SEFAZ ainda está processando a nota." };
  }
  if (res.tipo === "falha") {
    return { notaId: nota.id, status: nota.status, mudou: false, mensagem: res.mensagem };
  }

  if (res.tipo === "autorizada") {
    const xml = await baixarXml(urlFocus(base, res.caminhoXml), cfg.token);
    const r = await prisma.notaFiscal.updateMany({
      where: { id: nota.id, status: "EMITINDO" },
      data: {
        status: "AUTORIZADA",
        chaveAcesso: res.chave,
        ...(res.numero ? { numero: res.numero } : {}),
        ...(res.serie ? { serie: res.serie } : {}),
        protocolo: res.protocolo,
        mensagemSefaz: res.mensagem,
        xmlAutorizado: xml,
        danfeUrl: urlFocus(base, res.caminhoDanfe),
        dataAutorizacao: opts.agora ?? new Date(),
      },
    });
    return { notaId: nota.id, status: r.count ? "AUTORIZADA" : "EMITINDO", mudou: r.count > 0, mensagem: res.mensagem };
  }

  if (res.tipo === "cancelada") {
    const r = await prisma.notaFiscal.updateMany({
      where: { id: nota.id, status: "EMITINDO" },
      data: { status: "CANCELADA", mensagemSefaz: res.mensagem, dataCancelamento: opts.agora ?? new Date() },
    });
    return { notaId: nota.id, status: "CANCELADA", mudou: r.count > 0, mensagem: res.mensagem };
  }

  // Recusada: desfaz o que a emissão tinha marcado, tudo na mesma transação.
  const recusa = res;
  const mudou = await prisma.$transaction(async (tx) => {
    const r = await tx.notaFiscal.updateMany({
      where: { id: nota.id, status: "EMITINDO" },
      data: { status: recusa.status, mensagemSefaz: recusa.mensagem },
    });
    if (r.count === 0) return false; // outro processo já aplicou
    await desfazerEfeitosDaNota(tx, { ...nota, usuarioId: opts.usuarioId ?? null, mensagem: recusa.mensagem, novoStatus: recusa.status });
    return true;
  });
  return { notaId: nota.id, status: recusa.status, mudou, mensagem: recusa.mensagem };
}

/** Itens reservados por uma nota de devolução (NotaFiscal.devolucaoItens). */
export function itensReservados(json: Prisma.JsonValue | null): Array<{ itemVendaId: string; quantidade: number }> {
  if (!Array.isArray(json)) return [];
  return json
    .map((x) => x as { itemVendaId?: unknown; quantidade?: unknown })
    .filter((x) => typeof x.itemVendaId === "string" && Number(x.quantidade) > 0)
    .map((x) => ({ itemVendaId: x.itemVendaId as string, quantidade: Number(x.quantidade) }));
}

/** Devolve a reserva de quantidade da NF-e de devolução e desliga o RMA. */
export async function liberarReservaDevolucao(
  tx: Prisma.TransactionClient,
  nota: { id: string; empresaId: string; devolucaoItens: Prisma.JsonValue | null },
) {
  const itens = itensReservados(nota.devolucaoItens);
  for (const it of itens) {
    // Nunca abaixo de zero; filtra pela empresa via venda.
    await tx.$executeRaw`
      UPDATE itens_venda iv
         SET "quantidadeDevolvidaNota" = GREATEST(0, iv."quantidadeDevolvidaNota" - ${new Prisma.Decimal(it.quantidade)})
        FROM vendas v
       WHERE iv.id = ${it.itemVendaId} AND v.id = iv."vendaId" AND v."empresaId" = ${nota.empresaId}`;
  }
  await tx.solicitacaoRMA.updateMany({
    where: { empresaId: nota.empresaId, notaDevolucaoId: nota.id },
    data: { notaDevolucaoId: null },
  });
  return itens;
}

async function desfazerEfeitosDaNota(
  tx: Prisma.TransactionClient,
  nota: {
    id: string;
    empresaId: string;
    finalidade: number;
    numero: number;
    devolucaoItens: Prisma.JsonValue | null;
    usuarioId: string | null;
    mensagem: string;
    novoStatus: string;
  },
) {
  if (nota.finalidade === 4) {
    const itens = await liberarReservaDevolucao(tx, nota);
    await tx.logAuditoria.create({
      data: {
        usuarioId: nota.usuarioId,
        acao: "NFE_DEVOLUCAO_RECUSADA",
        entidade: "NotaFiscal",
        entidadeId: nota.id,
        dadosAntes: { status: "EMITINDO", reservado: itens },
        dadosDepois: { status: nota.novoStatus, reservado: [], mensagemSefaz: nota.mensagem },
      },
    });
    return;
  }
  const venda = await tx.venda.findFirst({
    where: { notaFiscalId: nota.id, empresaId: nota.empresaId },
    select: { id: true, status: true, numero: true },
  });
  if (!venda) return;
  const novoStatusVenda = venda.status === "FATURADA" ? "PAGA" : venda.status;
  await tx.venda.update({ where: { id: venda.id }, data: { notaFiscalId: null, status: novoStatusVenda } });
  await tx.itemVenda.updateMany({
    where: { vendaId: venda.id },
    data: { numeroItemNota: null, fiscalNota: Prisma.DbNull },
  });
  await tx.logAuditoria.create({
    data: {
      usuarioId: nota.usuarioId,
      acao: "NFE_RECUSADA_VENDA_REABERTA",
      entidade: "Venda",
      entidadeId: venda.id,
      dadosAntes: { status: venda.status, notaFiscalId: nota.id },
      dadosDepois: { status: novoStatusVenda, notaFiscalId: null, notaStatus: nota.novoStatus, mensagemSefaz: nota.mensagem },
    },
  });
}

/** Rodada do job: notas EMITINDO há mais de `idadeMinMs`, mais antigas primeiro, com limite. */
export async function sincronizarPendentes(opts: { limite?: number; idadeMinMs?: number; agora?: Date } = {}) {
  const agora = opts.agora ?? new Date();
  const pendentes = await prisma.notaFiscal.findMany({
    where: {
      status: "EMITINDO",
      modelo: { in: ["NFE_55", "NFCE_65"] },
      refProvedor: { not: null },
      dataEmissao: { lt: new Date(agora.getTime() - (opts.idadeMinMs ?? 60_000)) },
    },
    orderBy: { dataEmissao: "asc" },
    take: opts.limite ?? 50,
    select: { id: true },
  });
  const resultados: Array<ResultadoSincronizacao | { notaId: string; erro: string }> = [];
  for (const n of pendentes) {
    try {
      resultados.push(await sincronizarNota(n.id, { agora }));
    } catch (e) {
      resultados.push({ notaId: n.id, erro: (e as Error).message });
    }
  }
  return resultados;
}
