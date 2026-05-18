import axios from "axios";
import { prisma } from "../db";

// Emissor de NF-e / NFC-e
// =======================
// Abstrai o provedor (Focus NFe, Webmania, eNotas, etc.) atrás de uma
// interface simples. O sistema gera o payload no padrão brasileiro
// (CFOP, CST/CSOSN, alíquotas, NCM por produto) e envia para o provedor
// homologado, que assina o XML, transmite à SEFAZ e devolve o protocolo.
//
// O provedor mantém o certificado A1 e a fila com a SEFAZ — não tentamos
// reimplementar o cliente WebService.

export interface PayloadNfeItem {
  produto: {
    sku: string;
    codigoBarras?: string | null;
    nome: string;
    ncm: string;
    cest?: string | null;
    cfop: string;
    unidade: string;
    quantidade: number;
    valorUnitario: number;
    valorFrete?: number;
    valorDesconto?: number;
    origem: number;
    cstIcms?: string | null;
    aliquotaIcms?: number | null;
  };
}

export interface PayloadEmissao {
  natureza: string;
  ambiente: "homologacao" | "producao";
  emitenteCnpj: string;
  destinatario: {
    cpfCnpj?: string | null;
    nome: string;
    email?: string | null;
    endereco?: {
      logradouro: string;
      numero?: string;
      bairro?: string;
      municipio: string;
      uf: string;
      cep: string;
    };
  };
  itens: PayloadNfeItem[];
  pagamentos: Array<{ forma: string; valor: number }>;
  presencaComprador: "PRESENCIAL" | "INTERNET" | "TELEATENDIMENTO" | "ENTREGA_DOMICILIO";
  modelo: "55" | "65";
}

const FOCUS_BASE: Record<string, string> = {
  homologacao: "https://homologacao.focusnfe.com.br",
  producao: "https://api.focusnfe.com.br",
};

export async function emitirNotaFiscal(vendaId: string) {
  const venda = await prisma.venda.findUniqueOrThrow({
    where: { id: vendaId },
    include: {
      cliente: true,
      empresa: true,
      itens: { include: { produto: true } },
      pagamentos: true,
    },
  });
  if (venda.status === "CANCELADA")
    throw new Error("Não é possível emitir nota para venda cancelada");
  if (venda.notaFiscalId) throw new Error("Venda já possui nota emitida");

  const payload: PayloadEmissao = {
    natureza: "VENDA",
    ambiente: (process.env.FOCUS_NFE_AMBIENTE as "homologacao" | "producao") ?? "homologacao",
    emitenteCnpj: venda.empresa.cnpj,
    destinatario: {
      cpfCnpj: venda.cliente?.cpfCnpj ?? null,
      nome: venda.cliente?.nome ?? "Consumidor Final",
      email: venda.cliente?.email ?? null,
    },
    itens: venda.itens.map((it) => ({
      produto: {
        sku: it.produto.sku,
        codigoBarras: it.produto.codigoBarras,
        nome: it.produto.nome,
        ncm: it.produto.ncm ?? "00000000",
        cest: it.produto.cest ?? null,
        cfop: it.produto.cfopVendaInterna ?? "5102",
        unidade: it.produto.unidade,
        quantidade: Number(it.quantidade),
        valorUnitario: Number(it.precoUnitario),
        valorDesconto: Number(it.desconto),
        origem: it.produto.origemFiscal,
        cstIcms: it.produto.cstIcms,
        aliquotaIcms: it.produto.aliquotaIcms ? Number(it.produto.aliquotaIcms) : null,
      },
    })),
    pagamentos: venda.pagamentos.map((p) => ({ forma: p.formaPagamento, valor: Number(p.valor) })),
    presencaComprador:
      venda.origem === "BALCAO" || venda.origem === "PDV" ? "PRESENCIAL" : "INTERNET",
    modelo: venda.origem === "BALCAO" || venda.origem === "PDV" ? "65" : "55",
  };

  const ambiente = payload.ambiente;
  const ref = `venda-${venda.id}`;
  const url = `${FOCUS_BASE[ambiente]}/v2/${payload.modelo === "65" ? "nfce" : "nfe"}?ref=${ref}`;
  const { data } = await axios.post(url, montarPayloadFocus(payload), {
    auth: { username: process.env.FOCUS_NFE_TOKEN ?? "", password: "" },
    headers: { "Content-Type": "application/json" },
    validateStatus: () => true,
  });

  const nota = await prisma.notaFiscal.create({
    data: {
      empresaId: venda.empresaId,
      clienteId: venda.clienteId,
      modelo: payload.modelo === "65" ? "NFCE_65" : "NFE_55",
      serie: "1",
      numero: 0, // será preenchido pelo callback
      ambiente: ambiente === "producao" ? "PRODUCAO" : "HOMOLOGACAO",
      naturezaOperacao: "VENDA",
      valorProdutos: venda.valorBruto,
      valorFrete: venda.valorFrete,
      valorDesconto: venda.valorDesconto,
      valorTotal: venda.valorTotal,
      status: data.status === "autorizado" ? "AUTORIZADA" : "EMITINDO",
      chaveAcesso: data.chave_nfe ?? null,
      protocolo: data.protocolo ?? null,
      xmlAutorizado: data.xml ?? null,
      danfeUrl: data.url_danfe ?? null,
    },
  });

  await prisma.venda.update({
    where: { id: vendaId },
    data: { notaFiscalId: nota.id, status: "FATURADA" },
  });
  return nota;
}

function montarPayloadFocus(p: PayloadEmissao): Record<string, unknown> {
  // Conversão para o formato Focus NFe (campos abreviados conforme docs).
  return {
    natureza_operacao: p.natureza,
    data_emissao: new Date().toISOString(),
    tipo_documento: "1",
    finalidade_emissao: "1",
    presenca_comprador:
      p.presencaComprador === "PRESENCIAL" ? "1" :
      p.presencaComprador === "INTERNET" ? "2" :
      p.presencaComprador === "TELEATENDIMENTO" ? "3" : "4",
    cnpj_emitente: p.emitenteCnpj,
    nome_destinatario: p.destinatario.nome,
    cpf_destinatario: p.destinatario.cpfCnpj?.length === 11 ? p.destinatario.cpfCnpj : undefined,
    cnpj_destinatario: p.destinatario.cpfCnpj?.length === 14 ? p.destinatario.cpfCnpj : undefined,
    items: p.itens.map((it, idx) => ({
      numero_item: idx + 1,
      codigo_produto: it.produto.sku,
      descricao: it.produto.nome,
      cfop: it.produto.cfop,
      unidade_comercial: it.produto.unidade,
      quantidade_comercial: it.produto.quantidade,
      valor_unitario_comercial: it.produto.valorUnitario,
      valor_bruto: it.produto.quantidade * it.produto.valorUnitario,
      ncm: it.produto.ncm,
      cest: it.produto.cest,
      icms_origem: it.produto.origem,
      icms_situacao_tributaria: it.produto.cstIcms ?? "102", // CSOSN simples
      pis_situacao_tributaria: "07",
      cofins_situacao_tributaria: "07",
    })),
    formas_pagamento: p.pagamentos.map((pg) => ({
      forma_pagamento: mapearFormaFocus(pg.forma),
      valor_pagamento: pg.valor,
    })),
  };
}

function mapearFormaFocus(forma: string): string {
  return (
    {
      DINHEIRO: "01",
      CHEQUE: "02",
      CREDITO: "03",
      DEBITO: "04",
      CREDIARIO: "05",
      VALE_PRESENTE: "11",
      PIX: "17",
      BOLETO: "15",
      TRANSFERENCIA: "18",
    } as Record<string, string>
  )[forma] ?? "99";
}
