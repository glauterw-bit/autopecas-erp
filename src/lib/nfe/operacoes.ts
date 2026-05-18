import axios from "axios";
import { prisma } from "../db";

// Operações fiscais sobre NF-e já emitida.
// Cobre os eventos previstos pela SEFAZ:
//   - Cancelamento (até 24h, alguns estados até 168h)
//   - Carta de Correção Eletrônica (CC-e)
//   - Inutilização de numeração
//   - Manifestação do Destinatário (Ciência, Confirmação, Desconhecimento, Operação não realizada)
//   - Download de XML e DANFE
//
// Usamos provedor Focus NFe; trocar para Webmania/eNotas exige só este arquivo.

const FOCUS_BASE: Record<string, string> = {
  homologacao: "https://homologacao.focusnfe.com.br",
  producao: "https://api.focusnfe.com.br",
};

function authToken() {
  return { username: process.env.FOCUS_NFE_TOKEN ?? "", password: "" };
}
function ambiente() {
  return (process.env.FOCUS_NFE_AMBIENTE as "homologacao" | "producao") ?? "homologacao";
}

// 1) Cancelamento — exige justificativa mínima de 15 caracteres.
export async function cancelarNotaFiscal(notaId: string, justificativa: string) {
  if (justificativa.length < 15)
    throw new Error("Justificativa de cancelamento exige mínimo de 15 caracteres");
  const nota = await prisma.notaFiscal.findUniqueOrThrow({ where: { id: notaId } });
  if (nota.status !== "AUTORIZADA")
    throw new Error("Só é possível cancelar nota autorizada");
  const url = `${FOCUS_BASE[ambiente()]}/v2/${refDe(nota)}`;
  const { data } = await axios.delete(url, {
    auth: authToken(),
    data: { justificativa },
    validateStatus: () => true,
  });
  return prisma.notaFiscal.update({
    where: { id: notaId },
    data: {
      status: "CANCELADA",
      dataCancelamento: new Date(),
      motivoCancelamento: justificativa,
      xmlCancelamento: data.xml ?? null,
    },
  });
}

// 2) Carta de correção — corrige campos não-essenciais (frete, observações).
// Não pode corrigir valor, CNPJ, alíquota, base de cálculo. Múltiplas
// cartas são permitidas; armazenamos histórico em JSONB.
export async function emitirCartaCorrecao(notaId: string, correcao: string) {
  if (correcao.length < 15)
    throw new Error("Correção exige mínimo de 15 caracteres");
  const nota = await prisma.notaFiscal.findUniqueOrThrow({ where: { id: notaId } });
  const ref = refDe(nota);
  const ccePayload = {
    correcao,
    chave_nfe: nota.chaveAcesso,
  };
  const url = `${FOCUS_BASE[ambiente()]}/v2/${ref}/carta_correcao`;
  const { data } = await axios.post(url, ccePayload, {
    auth: authToken(),
    validateStatus: () => true,
  });

  const ccesAtuais = (nota.cce as Array<{ sequencia: number; correcao: string; protocolo?: string }>) ?? [];
  const proxSeq = (ccesAtuais.at(-1)?.sequencia ?? 0) + 1;
  return prisma.notaFiscal.update({
    where: { id: notaId },
    data: {
      cce: [
        ...ccesAtuais,
        {
          sequencia: proxSeq,
          correcao,
          protocolo: data.protocolo,
          xml: data.xml,
          emitidaEm: new Date().toISOString(),
        },
      ] as object,
    },
  });
}

// 3) Inutilização de faixa de numeração — usar quando numeração foi pulada
// (NF gerada localmente mas não transmitida, ou rejeitada e descartada).
export async function inutilizarRange(opts: {
  empresaId: string;
  serie: string;
  numeroInicial: number;
  numeroFinal: number;
  justificativa: string;
}) {
  if (opts.justificativa.length < 15)
    throw new Error("Justificativa exige 15 caracteres");
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: opts.empresaId },
  });
  const url = `${FOCUS_BASE[ambiente()]}/v2/nfe/inutilizacao`;
  const { data } = await axios.post(
    url,
    {
      cnpj: empresa.cnpj,
      serie: opts.serie,
      numero_inicial: opts.numeroInicial,
      numero_final: opts.numeroFinal,
      justificativa: opts.justificativa,
    },
    { auth: authToken(), validateStatus: () => true },
  );

  // Registra como NF inutilizada na base
  for (let n = opts.numeroInicial; n <= opts.numeroFinal; n++) {
    await prisma.notaFiscal.upsert({
      where: {
        empresaId_modelo_serie_numero: {
          empresaId: opts.empresaId,
          modelo: "NFE_55",
          serie: opts.serie,
          numero: n,
        },
      },
      update: { status: "INUTILIZADA", motivoCancelamento: opts.justificativa },
      create: {
        empresaId: opts.empresaId,
        modelo: "NFE_55",
        serie: opts.serie,
        numero: n,
        status: "INUTILIZADA",
        ambiente: ambiente() === "producao" ? "PRODUCAO" : "HOMOLOGACAO",
        naturezaOperacao: "INUTILIZAÇÃO",
        valorProdutos: 0,
        valorTotal: 0,
        motivoCancelamento: opts.justificativa,
      },
    });
  }
  return data;
}

// 4) Manifestação do destinatário — eventos 210200 (Confirmação),
// 210210 (Ciência), 210220 (Desconhecimento), 210240 (Operação não realizada).
// Importante para auto peças: confirma recebimento de NF de entrada antes de
// dar entrada no estoque (proteção anti-fraude).
export type EventoManifestacao =
  | "CONFIRMACAO"
  | "CIENCIA"
  | "DESCONHECIMENTO"
  | "OPERACAO_NAO_REALIZADA";

export async function manifestarDestinatario(opts: {
  empresaId: string;
  chaveAcesso: string;
  evento: EventoManifestacao;
  justificativa?: string;
}) {
  if (opts.evento === "OPERACAO_NAO_REALIZADA" && !opts.justificativa)
    throw new Error("Operação não realizada exige justificativa");
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: opts.empresaId },
  });
  const tipoEvento = {
    CONFIRMACAO: "confirmacao",
    CIENCIA: "ciencia",
    DESCONHECIMENTO: "desconhecimento",
    OPERACAO_NAO_REALIZADA: "nao_realizada",
  }[opts.evento];
  const url = `${FOCUS_BASE[ambiente()]}/v2/nfe/manifestacao/${opts.chaveAcesso}/${tipoEvento}`;
  const { data } = await axios.post(
    url,
    {
      cnpj: empresa.cnpj,
      justificativa: opts.justificativa,
    },
    { auth: authToken(), validateStatus: () => true },
  );
  return data;
}

// 5) Consulta NF-e (na SEFAZ) — útil para verificar se foi cancelada/denegada.
export async function consultarNFe(chaveAcesso: string) {
  const url = `${FOCUS_BASE[ambiente()]}/v2/nfe/${chaveAcesso}`;
  const { data } = await axios.get(url, { auth: authToken(), validateStatus: () => true });
  return data;
}

// 6) Download de XML autorizado e DANFE (PDF).
export async function baixarDocumentos(notaId: string) {
  const nota = await prisma.notaFiscal.findUniqueOrThrow({ where: { id: notaId } });
  if (!nota.chaveAcesso) throw new Error("Nota sem chave de acesso");
  const xmlUrl = `${FOCUS_BASE[ambiente()]}/v2/nfe/${nota.chaveAcesso}.xml`;
  const danfeUrl = `${FOCUS_BASE[ambiente()]}/v2/nfe/${nota.chaveAcesso}.pdf`;
  return { xmlUrl, danfeUrl };
}

function refDe(nota: { id: string }) {
  return `nfe?ref=venda-${nota.id}`;
}
