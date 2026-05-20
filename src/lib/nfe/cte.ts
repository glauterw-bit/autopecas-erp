import axios from "axios";
import { prisma } from "../db";

// CT-e — Conhecimento de Transporte Eletrônico
// ============================================
// Documento fiscal usado pelo transportador (não pelo lojista que faz entrega
// própria). Caso a auto peças contrate frete, ela é a TOMADORA do serviço e
// recebe o CT-e emitido pelo transportador.
//
// O sistema:
//   - importa CT-e via XML/chave (entrada),
//   - registra como conta a pagar para o transportador,
//   - emite CT-e próprio quando a loja for transportadora (raro mas existe).

const FOCUS_BASE: Record<string, string> = {
  homologacao: "https://homologacao.focusnfe.com.br",
  producao: "https://api.focusnfe.com.br",
};

export interface CteInput {
  empresaId: string;
  tomador: { cnpjCpf: string; nome: string; uf: string };
  remetente: { cnpjCpf: string; nome: string };
  destinatario: { cnpjCpf: string; nome: string };
  modal: "01" | "02" | "03" | "04" | "05" | "06"; // 01=rodoviário
  tipoCte: "0" | "1" | "2" | "3"; // 0=normal, 1=complementar, 2=anulação, 3=substituto
  cfop: string; // ex.: "5353"
  valorTotal: number;
  valorCarga: number;
  pesoBrutoKg: number;
  ufInicio: string;
  ufFim: string;
  cidadeInicioIbge: string;
  cidadeFimIbge: string;
  notasFiscaisVinculadas?: string[]; // chaves das NF-e
}

export async function emitirCte(input: CteInput) {
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: input.empresaId },
  });
  const ambiente = (process.env.FOCUS_NFE_AMBIENTE as "homologacao" | "producao") ?? "homologacao";
  const ref = `cte-${Date.now()}`;

  const payload = {
    cnpj_emitente: empresa.cnpj,
    ie_emitente: empresa.inscEstadual,
    nome_emitente: empresa.razaoSocial,
    modal: input.modal,
    tipo_cte: input.tipoCte,
    cfop: input.cfop,
    natureza_operacao: "Prestação de serviço de transporte",
    tomador: input.tomador,
    remetente: input.remetente,
    destinatario: input.destinatario,
    uf_inicio_prestacao: input.ufInicio,
    uf_fim_prestacao: input.ufFim,
    municipio_inicio_prestacao: input.cidadeInicioIbge,
    municipio_fim_prestacao: input.cidadeFimIbge,
    valor_total_servico: input.valorTotal,
    valor_a_receber: input.valorTotal,
    valor_carga: input.valorCarga,
    peso_bruto: input.pesoBrutoKg,
    produto_predominante: "Auto peças",
    documentos_originarios: (input.notasFiscaisVinculadas ?? []).map((c) => ({
      chave_nfe: c,
    })),
  };

  const url = `${FOCUS_BASE[ambiente]}/v2/cte?ref=${ref}`;
  const { data } = await axios.post(url, payload, {
    auth: { username: process.env.FOCUS_NFE_TOKEN ?? "", password: "" },
    headers: { "Content-Type": "application/json" },
    validateStatus: () => true,
  });

  return data;
}

// Importação de CT-e recebido (entrada): cria conta a pagar.
export async function importarCteEntrada(opts: {
  empresaId: string;
  fornecedorId: string;       // transportador
  chaveCte: string;
  numero: string;
  serie: string;
  dataEmissao: Date;
  valorTotal: number;
  vencimento: Date;
}) {
  return prisma.contaPagar.create({
    data: {
      empresaId: opts.empresaId,
      fornecedorId: opts.fornecedorId,
      descricao: `CT-e ${opts.numero}/${opts.serie} — chave ${opts.chaveCte.slice(-6)}`,
      documento: opts.chaveCte,
      dataVencimento: opts.vencimento,
      valor: opts.valorTotal,
      status: "ABERTO",
    },
  });
}
