import axios from "axios";
import { prisma } from "../db";
import { ApiError } from "../auth/guard";
import { registrarNotaEmitida } from "../assinatura/politica";
import { reaisParaCentavos, centavosParaReais } from "../fiscal/centavos";
import type { RegimeEmitente } from "../fiscal/st-sp";
import { configFiscalDaEmpresa, configFocus, FOCUS_BASE } from "./config-focus";
import { montarNota, type ConfigFiscalEmpresa, type DadosNota, type ItemCalculado } from "./payload";

// Emissor de NF-e / NFC-e
// =======================
// Carrega a venda, monta a nota com `montarNota` (puro, testado em
// payload.test.ts) e envia ao provedor homologado (Focus NFe), que assina o
// XML, transmite à SEFAZ e devolve o protocolo.
// Se faltar dado obrigatório (NCM, CST, CFOP, IBS/CBS...) a emissão BLOQUEIA
// com a lista do que corrigir — nunca manda valor inventado.

/** Dados do emitente usados por venda e devolução. */
export function emitenteDaEmpresa(empresa: {
  cnpj: string;
  inscEstadual: string | null;
  uf: string | null;
  regimeTributario: string;
  configuracoes: unknown;
}) {
  return {
    cnpj: empresa.cnpj,
    inscricaoEstadual: empresa.inscEstadual,
    uf: empresa.uf,
    regime: empresa.regimeTributario as RegimeEmitente,
    config: configFiscalDaEmpresa(empresa.configuracoes) as ConfigFiscalEmpresa,
  };
}

export function destinatarioDoCliente(
  cliente: {
    cpfCnpj: string | null;
    nome: string;
    email: string | null;
    rgIe: string | null;
    tipo: string;
    logradouro: string | null;
    numero: string | null;
    bairro: string | null;
    municipio: string | null;
    uf: string | null;
    cep: string | null;
  } | null,
) {
  if (!cliente) return { nome: "Consumidor Final" };
  return {
    cpfCnpj: cliente.cpfCnpj,
    nome: cliente.nome,
    email: cliente.email,
    inscricaoEstadual: cliente.tipo === "PJ" ? cliente.rgIe : null,
    endereco: {
      logradouro: cliente.logradouro,
      numero: cliente.numero,
      bairro: cliente.bairro,
      municipio: cliente.municipio,
      uf: cliente.uf,
      cep: cliente.cep,
    },
  };
}

/** Retrato fiscal do item, gravado em ItemVenda.fiscalNota para a devolução espelhar. */
export function retratoFiscalItem(c: ItemCalculado, it: DadosNota["itens"][number]) {
  return {
    cfop: c.cfop,
    cstIcms: c.cstIcms,
    aliquotaIcms: c.aliquotaIcms,
    cstPis: c.pisCofins.cstPis,
    cstCofins: c.pisCofins.cstCofins,
    pisAliquota: c.pisCofins.aliquotaPis,
    cofinsAliquota: c.pisCofins.aliquotaCofins,
    monofasico: c.pisCofins.monofasico,
    cstIbsCbs: c.ibsCbs?.cst ?? it.cstIbsCbs ?? null,
    cClassTrib: c.ibsCbs?.cClassTrib ?? it.cClassTrib ?? null,
    ncm: it.ncm ?? null,
    cest: it.cest ?? null,
    origem: it.origem,
  };
}
export type RetratoFiscalItem = ReturnType<typeof retratoFiscalItem>;

/** Número provisório (negativo) até o retorno da SEFAZ: evita colisão no @@unique. */
export async function numeroProvisorio(empresaId: string): Promise<number> {
  const n = await prisma.notaFiscal.count({ where: { empresaId } });
  return -((n + 1) * 1000 + Math.floor(Math.random() * 1000));
}

export const MSG_SEM_TOKEN_FOCUS = "Emissão de nota não configurada: falta o token da Focus NFe desta empresa";

/** Configuração da Focus com token; sem token, bloqueia antes de gravar qualquer nota. */
export function configFocusComToken(empresa: { cnpj: string; configuracoes?: unknown }) {
  const cfg = configFocus(empresa);
  if (!cfg.token.trim()) throw new ApiError(422, MSG_SEM_TOKEN_FOCUS);
  return cfg;
}

export async function enviarFocus(opts: {
  empresa: { cnpj: string; configuracoes: unknown };
  modelo: "55" | "65";
  ref: string;
  payload: Record<string, unknown>;
}) {
  const cfg = configFocusComToken(opts.empresa);
  const url = `${FOCUS_BASE[cfg.ambiente]}/v2/${opts.modelo === "65" ? "nfce" : "nfe"}?ref=${opts.ref}`;
  const resp = await axios.post(url, opts.payload, {
    auth: { username: cfg.token, password: "" },
    headers: { "Content-Type": "application/json" },
    validateStatus: () => true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { cfg, http: resp.status, data: (resp.data ?? {}) as Record<string, any> };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function statusDaResposta(http: number, data: Record<string, any>) {
  if (http >= 400 || data.status === "erro_autorizacao" || data.status === "denegado") {
    return {
      status: (data.status === "denegado" ? "DENEGADA" : "REJEITADA") as "DENEGADA" | "REJEITADA",
      mensagem: String(data.mensagem_sefaz ?? data.mensagem ?? `Erro HTTP ${http}`).slice(0, 500),
    };
  }
  return {
    status: (data.status === "autorizado" ? "AUTORIZADA" : "EMITINDO") as "AUTORIZADA" | "EMITINDO",
    mensagem: data.mensagem_sefaz ? String(data.mensagem_sefaz).slice(0, 500) : null,
  };
}

export async function emitirNotaFiscal(vendaId: string, empresaId?: string) {
  const venda = await prisma.venda.findFirstOrThrow({
    where: { id: vendaId, ...(empresaId ? { empresaId } : {}) },
    include: {
      cliente: true,
      empresa: true,
      itens: { include: { produto: true }, orderBy: { id: "asc" } },
      pagamentos: true,
    },
  });
  if (venda.status === "CANCELADA")
    throw new ApiError(422, "Não é possível emitir nota para venda cancelada");
  if (venda.notaFiscalId) throw new ApiError(422, "Venda já possui nota emitida");
  configFocusComToken(venda.empresa);

  const modelo: "55" | "65" = venda.origem === "BALCAO" || venda.origem === "PDV" ? "65" : "55";
  const dados: DadosNota = {
    modelo,
    finalidade: 1,
    tipoDocumento: 1,
    natureza: "VENDA",
    dataEmissao: new Date(),
    emitente: emitenteDaEmpresa(venda.empresa),
    destinatario: destinatarioDoCliente(venda.cliente),
    itens: venda.itens.map((it) => ({
      sku: it.produto.sku,
      codigoBarras: it.produto.codigoBarras,
      nome: it.produto.nome,
      ncm: it.produto.ncm,
      cest: it.produto.cest,
      unidade: it.produto.unidade,
      quantidade: it.quantidade.toString(),
      valorUnitario: it.precoUnitario.toString(),
      descontoCentavos: reaisParaCentavos(it.desconto),
      origem: it.produto.origemFiscal,
      cstIcms: it.produto.cstIcms,
      cfopInterna: it.produto.cfopVendaInterna,
      cfopInterestadual: it.produto.cfopVendaInterestadual,
      aliquotaIcms: it.produto.aliquotaIcms != null ? Number(it.produto.aliquotaIcms) : null,
      monofasico: it.produto.monofasicoPisCofins,
      cstPis: it.produto.cstPis,
      cstCofins: it.produto.cstCofins,
      pisAliquota: it.produto.pisAliquota != null ? Number(it.produto.pisAliquota) : null,
      cofinsAliquota: it.produto.cofinsAliquota != null ? Number(it.produto.cofinsAliquota) : null,
      cstIbsCbs: it.produto.cstIbsCbs,
      cClassTrib: it.produto.cClassTrib,
    })),
    freteCentavos: reaisParaCentavos(venda.valorFrete),
    pagamentos: venda.pagamentos.map((p) => ({
      forma: p.formaPagamento,
      valorCentavos: reaisParaCentavos(p.valor),
    })),
    presenca: modelo === "65" ? "PRESENCIAL" : "INTERNET",
  };

  const montada = montarNota(dados);
  if (!montada.ok) {
    throw new ApiError(422, `Nota bloqueada — corrija antes de emitir:\n- ${montada.erros.join("\n- ")}`);
  }

  const ref = `venda-${venda.id}`;
  const { cfg, http, data } = await enviarFocus({
    empresa: venda.empresa,
    modelo,
    ref,
    payload: montada.payload,
  });
  const st = statusDaResposta(http, data);
  const t = montada.totais;
  const numero = Number(data.numero) || (await numeroProvisorio(venda.empresaId));

  const nota = await prisma.$transaction(async (tx) => {
    const criada = await tx.notaFiscal.create({
      data: {
        empresaId: venda.empresaId,
        clienteId: venda.clienteId,
        modelo: modelo === "65" ? "NFCE_65" : "NFE_55",
        serie: modelo === "65" ? cfg.serieNfce : cfg.serieNfe,
        numero,
        ambiente: cfg.ambiente === "producao" ? "PRODUCAO" : "HOMOLOGACAO",
        naturezaOperacao: "VENDA",
        refProvedor: ref,
        valorProdutos: centavosParaReais(t.produtosCentavos),
        valorFrete: centavosParaReais(t.freteCentavos),
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

    // Guarda nItem e o retrato fiscal de cada item: a devolução referencia por item.
    for (const c of montada.itens) {
      const iv = venda.itens[c.numeroItem - 1];
      await tx.itemVenda.update({
        where: { id: iv.id },
        data: {
          numeroItemNota: c.numeroItem,
          fiscalNota: retratoFiscalItem(c, dados.itens[c.numeroItem - 1]),
        },
      });
    }
    await tx.venda.update({
      where: { id: venda.id },
      data: { notaFiscalId: criada.id, status: "FATURADA" },
    });
    return criada;
  });

  if (st.status === "REJEITADA" || st.status === "DENEGADA") {
    throw new ApiError(422, `A SEFAZ/Focus recusou a nota: ${st.mensagem}`);
  }
  // Plano: conta a nota do mês (excedente vira cobrança futura; nunca bloqueia a emissão).
  if (nota.ambiente === "PRODUCAO") await registrarNotaEmitida(prisma, venda.empresaId);
  return nota;
}

export { mapearFormaFocus } from "./payload";
