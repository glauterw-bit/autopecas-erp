import crypto from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../db";

// Eventos do Asaas -> estado da assinatura.
//
//  PAYMENT_CONFIRMED / PAYMENT_RECEIVED  -> ATIVA (zera a inadimplência)
//  PAYMENT_OVERDUE                       -> INADIMPLENTE (conta a carência desde o vencimento)
//  SUBSCRIPTION_DELETED / _INACTIVATED   -> CANCELADA
//  demais eventos                        -> gravados e ignorados
//
// Idempotente: o id do evento vira EventoWebhook(origem ASAAS, idExterno) e um
// evento repetido não mexe em nada. Suspensão feita à mão pelo dono do SaaS
// (suspensaMotivo) não é desfeita por pagamento: só a reativação manual.

export type EventoAsaas = {
  id?: string;
  event?: string;
  payment?: {
    id?: string;
    customer?: string;
    subscription?: string | null;
    dueDate?: string;
    status?: string;
    externalReference?: string | null;
  };
  subscription?: { id?: string; customer?: string; externalReference?: string | null };
};

export type ResultadoEvento = "PROCESSADO" | "DUPLICADO" | "IGNORADO";

const PAGOS = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);

export function idDoEvento(e: EventoAsaas): string {
  if (e.id) return String(e.id).slice(0, 120);
  const bruto = [e.event, e.payment?.id, e.payment?.status, e.subscription?.id].join("|");
  return "h_" + crypto.createHash("sha256").update(bruto).digest("hex").slice(0, 40);
}

function somarCiclo(dataISO: string | undefined, ciclo: "MENSAL" | "ANUAL"): Date | null {
  if (!dataISO || !/^\d{4}-\d{2}-\d{2}/.test(dataISO)) return null;
  const d = new Date(`${dataISO.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCMonth(d.getUTCMonth() + (ciclo === "ANUAL" ? 12 : 1));
  return d;
}

function dataDoVencimento(dataISO: string | undefined): Date | null {
  if (!dataISO || !/^\d{4}-\d{2}-\d{2}/.test(dataISO)) return null;
  const d = new Date(`${dataISO.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

type Db = PrismaClient;

export async function processarEventoAsaas(evento: EventoAsaas, db: Db = prisma): Promise<ResultadoEvento> {
  const idExterno = idDoEvento(evento);
  const topico = String(evento.event ?? "").slice(0, 80);

  let registroId: string;
  try {
    const r = await db.eventoWebhook.create({
      data: {
        origem: "ASAAS",
        idExterno,
        topico,
        recurso: evento.payment?.id ?? evento.subscription?.id ?? null,
        payload: JSON.parse(JSON.stringify(evento)) as Prisma.InputJsonValue,
      },
    });
    registroId = r.id;
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") throw e;
    const existente = await db.eventoWebhook.findUnique({ where: { origem_idExterno: { origem: "ASAAS", idExterno } } });
    if (!existente || existente.status === "PROCESSADO" || existente.status === "IGNORADO") return "DUPLICADO";
    // PENDENTE/ERRO: uma tentativa anterior não terminou; processa de novo.
    await db.eventoWebhook.update({ where: { id: existente.id }, data: { tentativas: { increment: 1 } } });
    registroId = existente.id;
  }

  try {
    const resultado = await aplicar(evento, db, registroId);
    await db.eventoWebhook.update({
      where: { id: registroId },
      data: { status: resultado === "PROCESSADO" ? "PROCESSADO" : "IGNORADO", processadoEm: new Date() },
    });
    return resultado;
  } catch (e) {
    await db.eventoWebhook
      .update({ where: { id: registroId }, data: { status: "ERRO", erro: (e as Error).message.slice(0, 300) } })
      .catch(() => undefined);
    throw e;
  }
}

async function aplicar(e: EventoAsaas, db: Db, registroId: string): Promise<ResultadoEvento> {
  const tipo = e.event ?? "";
  const ehPagamento = tipo === "PAYMENT_CONFIRMED" || tipo === "PAYMENT_RECEIVED" || tipo === "PAYMENT_OVERDUE";
  const ehAssinatura = tipo === "SUBSCRIPTION_DELETED" || tipo === "SUBSCRIPTION_INACTIVATED";
  if (!ehPagamento && !ehAssinatura) return "IGNORADO";

  const assinaturaId = e.payment?.subscription ?? e.subscription?.id ?? null;
  const clienteId = e.payment?.customer ?? e.subscription?.customer ?? null;
  const ref = e.payment?.externalReference ?? e.subscription?.externalReference ?? null;

  const ass =
    (assinaturaId && (await db.assinatura.findUnique({ where: { asaasAssinaturaId: assinaturaId } }))) ||
    (clienteId && (await db.assinatura.findFirst({ where: { asaasClienteId: clienteId } }))) ||
    (ref && (await db.assinatura.findUnique({ where: { empresaId: ref } }))) ||
    null;
  if (!ass) {
    await db.eventoWebhook.update({ where: { id: registroId }, data: { erro: "assinatura não encontrada" } });
    return "IGNORADO";
  }
  await db.eventoWebhook.update({ where: { id: registroId }, data: { empresaId: ass.empresaId } });

  const antes = { status: ass.status, inadimplenteDesde: ass.inadimplenteDesde, proximoVencimento: ass.proximoVencimento };
  let dados: Prisma.AssinaturaUpdateInput | null = null;

  if (tipo === "PAYMENT_CONFIRMED" || tipo === "PAYMENT_RECEIVED") {
    const suspensaAMao = ass.status === "SUSPENSA" && !!ass.suspensaMotivo;
    if (ass.status === "CANCELADA" || suspensaAMao) return "IGNORADO";
    dados = {
      status: "ATIVA",
      inadimplenteDesde: null,
      proximoVencimento: somarCiclo(e.payment?.dueDate, ass.ciclo) ?? ass.proximoVencimento,
    };
  } else if (tipo === "PAYMENT_OVERDUE") {
    // Aviso fora de ordem: se a mesma cobrança já aparece paga, não derruba a loja.
    if (e.payment?.status && PAGOS.has(e.payment.status)) return "IGNORADO";
    if (ass.status === "SUSPENSA" || ass.status === "CANCELADA") return "IGNORADO";
    dados = {
      status: "INADIMPLENTE",
      inadimplenteDesde: ass.inadimplenteDesde ?? dataDoVencimento(e.payment?.dueDate) ?? new Date(),
    };
  } else {
    if (ass.status === "CANCELADA") return "IGNORADO";
    dados = { status: "CANCELADA", canceladaEm: new Date() };
  }

  await db.$transaction(async (tx) => {
    const depois = await tx.assinatura.update({ where: { id: ass.id }, data: dados! });
    await tx.logAuditoria.create({
      data: {
        acao: `ASSINATURA_${tipo}`,
        entidade: "Assinatura",
        entidadeId: ass.id,
        dadosAntes: JSON.parse(JSON.stringify(antes)) as Prisma.InputJsonValue,
        dadosDepois: JSON.parse(
          JSON.stringify({ status: depois.status, inadimplenteDesde: depois.inadimplenteDesde, proximoVencimento: depois.proximoVencimento, empresaId: ass.empresaId }),
        ) as Prisma.InputJsonValue,
      },
    });
  });
  return "PROCESSADO";
}
