import axios from "axios";
import { prisma } from "../db";
import { gerarTxid } from "./pix";
import { configPspDoAmbiente, erroPspSeguro, ErroPsp, PspPixClient } from "./psp-pix";

// Pix Automático / Recorrente (BACEN — vigente desde 06/2025)
// ===========================================================
// Permite cobrar valores recorrentes (mensalidade frotista, plano de
// manutenção preventiva, programa de fidelidade) sem que o cliente precise
// autorizar cada pagamento — uma única vez ele assina o "consentimento Pix
// Automático" pelo app do banco e o PSP debita automaticamente.
//
// Endpoints BACEN (resolução BCB 305/2023):
//   PUT  /rec/{idRec}         → cria a recorrência
//   PATCH /rec/{idRec}        → atualiza (pausar/retomar)
//   POST /cobr/{txid}         → cobrança imediata derivada da recorrência
//   GET  /rec/{idRec}/cobrancas → histórico

const BASE = process.env.PSP_PIX_BASE_URL ?? "";

export type PeriodicidadePixAutomatico =
  | "SEMANAL"
  | "MENSAL"
  | "TRIMESTRAL"
  | "SEMESTRAL"
  | "ANUAL";

export interface AssinaturaPixRecorrente {
  id: string;            // idRec local
  clienteId: string;
  descricao: string;
  valor: number;
  periodicidade: PeriodicidadePixAutomatico;
  dataInicio: Date;
  dataFim?: Date;        // null = indeterminado
  diaCobranca: number;   // dia do mês (1-28)
}

// Mesmo cliente (e mesmo certificado mTLS) da cobrança imediata. O BCB exige
// mTLS em toda a API Pix, inclusive /rec e /cobr.
let cliente: PspPixClient | null = null;
async function sessaoPsp() {
  if (!cliente) {
    const cfg = configPspDoAmbiente();
    if (!cfg) throw new ErroPsp("PSP Pix não configurado");
    cliente = new PspPixClient({
      ...cfg,
      scope: cfg.scope ?? "rec.write rec.read cobr.write cobr.read",
    });
  }
  return cliente.credenciais();
}

async function chamarPsp<T>(etapa: string, fn: (token: string, httpsAgent: import("node:https").Agent | undefined) => Promise<{ data: T }>) {
  const { token, httpsAgent } = await sessaoPsp();
  try {
    return (await fn(token, httpsAgent)).data;
  } catch (e) {
    throw erroPspSeguro(e, etapa);
  }
}

// Cria a recorrência no PSP — gera URL de aprovação que o cliente abre no app
// do banco para autorizar. Após aprovação, o PSP responde com webhook.
export async function criarAssinatura(assin: AssinaturaPixRecorrente) {
  const cliente = await prisma.cliente.findUniqueOrThrow({
    where: { id: assin.clienteId },
  });
  const data = await chamarPsp("rec", (token, httpsAgent) => axios.put(
    `${BASE}/rec/${assin.id}`,
    {
      vinculo: {
        contrato: assin.descricao.slice(0, 35),
        objeto: assin.descricao.slice(0, 35),
      },
      calendario: {
        dataInicial: assin.dataInicio.toISOString().slice(0, 10),
        dataFinal: assin.dataFim?.toISOString().slice(0, 10),
        periodicidade: assin.periodicidade,
      },
      politicaRetentativa: "PERMITE_3R", // até 3 retentativas
      valor: { valorRec: assin.valor.toFixed(2) },
      ativacao: { dadosJornada: { txid: gerarTxid("REC") } },
      devedor:
        cliente.cpfCnpj?.length === 11
          ? { cpf: cliente.cpfCnpj, nome: cliente.nome }
          : { cnpj: cliente.cpfCnpj, nome: cliente.nome },
    },
    { headers: { Authorization: `Bearer ${token}` }, httpsAgent },
  ));
  return data;
}

export async function pausarAssinatura(idRec: string) {
  const data = await chamarPsp("rec", (token, httpsAgent) => axios.patch(
    `${BASE}/rec/${idRec}`,
    { status: "PAUSADO" },
    { headers: { Authorization: `Bearer ${token}` }, httpsAgent },
  ));
  return data;
}

export async function retomarAssinatura(idRec: string) {
  const data = await chamarPsp("rec", (token, httpsAgent) => axios.patch(
    `${BASE}/rec/${idRec}`,
    { status: "ATIVO" },
    { headers: { Authorization: `Bearer ${token}` }, httpsAgent },
  ));
  return data;
}

export async function cancelarAssinatura(idRec: string, motivo: string) {
  const data = await chamarPsp("rec", (token, httpsAgent) => axios.patch(
    `${BASE}/rec/${idRec}`,
    { status: "CANCELADO", motivoCancelamento: motivo },
    { headers: { Authorization: `Bearer ${token}` }, httpsAgent },
  ));
  return data;
}

// Cobranças individuais derivadas da recorrência. Em geral o PSP gera
// automaticamente; este endpoint é para forçar uma cobrança extra.
export async function gerarCobrancaImediata(idRec: string, valorOverride?: number) {
  const txid = gerarTxid("RECCOB");
  const data = await chamarPsp("cobr", (token, httpsAgent) => axios.put(
    `${BASE}/cobr/${txid}`,
    {
      idRec,
      ...(valorOverride && { valor: { original: valorOverride.toFixed(2) } }),
    },
    { headers: { Authorization: `Bearer ${token}` }, httpsAgent },
  ));
  return data;
}
