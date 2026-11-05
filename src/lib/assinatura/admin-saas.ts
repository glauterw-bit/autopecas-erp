import type { PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { ApiError } from "../auth/guard";
import { registrarAuditoria } from "../auth/auditoria";
import { DIA_MS, suspensaoMinDias, type StatusAssinatura } from "./estado";

// Painel do dono do SaaS (/admin-saas). O acesso NÃO vem do perfil da loja:
// só os e-mails da env SAAS_ADMIN_EMAILS (separados por vírgula).

export function emailsAdminSaas(env: Record<string, string | undefined> = process.env): string[] {
  return (env.SAAS_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function ehAdminSaas(email: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!email) return false;
  return emailsAdminSaas(env).includes(email.trim().toLowerCase());
}

export function exigirAdminSaas(email: string | null | undefined): void {
  // 404 de propósito: quem não é o dono nem fica sabendo que o painel existe.
  if (!ehAdminSaas(email)) throw new ApiError(404, "Não encontrado");
}

type ParaMrr = {
  status: StatusAssinatura;
  ciclo: "MENSAL" | "ANUAL";
  plano: { precoMensal: { toString(): string }; precoAnual: { toString(): string } };
};

const centavos = (v: { toString(): string }) => Math.round(Number(v.toString()) * 100);

/** MRR = soma das assinaturas ATIVAS (anual dividido por 12). Sem projeção. Em centavos. */
export function calcularMrrCentavos(lista: ParaMrr[]): number {
  return lista
    .filter((a) => a.status === "ATIVA")
    .reduce((soma, a) => soma + (a.ciclo === "ANUAL" ? Math.round(centavos(a.plano.precoAnual) / 12) : centavos(a.plano.precoMensal)), 0);
}

/** Suspender cobrança em atraso só depois de 15 dias, a não ser que o dono force (fraude, pedido do cliente). */
export function checarSuspensao(
  a: { status: StatusAssinatura; inadimplenteDesde: Date | null; trialFimEm: Date | null },
  agora: Date,
  forcar: boolean,
): string | null {
  if (forcar) return null;
  const inicio = a.status === "INADIMPLENTE" ? a.inadimplenteDesde : a.status === "TRIAL" && a.trialFimEm && a.trialFimEm < agora ? a.trialFimEm : null;
  if (inicio) {
    const dias = Math.floor((agora.getTime() - inicio.getTime()) / DIA_MS);
    const minimo = suspensaoMinDias();
    if (dias < minimo) {
      return `A loja está em atraso há ${dias} dia(s). Por regra, o balcão só para depois de ${minimo} dias de atraso e aviso. Marque "forçar" só se for fraude ou pedido da própria loja.`;
    }
  }
  return null;
}

type Db = PrismaClient;

export async function listarLojas(db: Db = prisma) {
  const [assinaturas, logins] = await Promise.all([
    db.assinatura.findMany({ include: { plano: true, empresa: { select: { id: true, razaoSocial: true, municipio: true, uf: true, criadoEm: true } } }, orderBy: { criadoEm: "desc" } }),
    db.usuario.groupBy({ by: ["empresaId"], _max: { ultimoLogin: true } }),
  ]);
  const ultimo = new Map(logins.map((l) => [l.empresaId, l._max.ultimoLogin]));
  const lojas = assinaturas.map((a) => ({
    empresaId: a.empresaId,
    razaoSocial: a.empresa.razaoSocial,
    cidade: [a.empresa.municipio, a.empresa.uf].filter(Boolean).join("/") || null,
    criadoEm: a.empresa.criadoEm,
    plano: a.plano.codigo,
    planoNome: a.plano.nome,
    status: a.status,
    ciclo: a.ciclo,
    trialFimEm: a.trialFimEm,
    inadimplenteDesde: a.inadimplenteDesde,
    suspensaMotivo: a.suspensaMotivo,
    ultimoAcesso: ultimo.get(a.empresaId) ?? null,
  }));
  return { lojas, mrrCentavos: calcularMrrCentavos(assinaturas) };
}

type Ator = { id: string; empresaId: string };

async function achar(db: Db, empresaId: string) {
  const a = await db.assinatura.findUnique({ where: { empresaId }, include: { plano: true } });
  if (!a) throw new ApiError(404, "Loja não encontrada.");
  return a;
}

export async function estenderTrial(ator: Ator, empresaId: string, dias: number, db: Db = prisma, agora = new Date()) {
  const a = await achar(db, empresaId);
  if (a.status !== "TRIAL") throw new ApiError(422, "Só dá para estender o teste de quem está em período de teste.");
  const base = a.trialFimEm && a.trialFimEm > agora ? a.trialFimEm : agora;
  const novo = new Date(base.getTime() + dias * DIA_MS);
  await db.$transaction(async (tx) => {
    await tx.assinatura.update({ where: { id: a.id }, data: { trialFimEm: novo } });
    await registrarAuditoria(tx, {
      empresaId: ator.empresaId, usuarioId: ator.id, acao: "SAAS_TRIAL_ESTENDIDO", entidade: "Assinatura", entidadeId: a.id,
      antes: { trialFimEm: a.trialFimEm }, depois: { trialFimEm: novo, dias, loja: empresaId },
    });
  });
  return { trialFimEm: novo };
}

export async function mudarPlano(ator: Ator, empresaId: string, planoCodigo: string, db: Db = prisma) {
  const a = await achar(db, empresaId);
  const plano = await db.plano.findUnique({ where: { codigo: planoCodigo } });
  if (!plano || !plano.ativo) throw new ApiError(404, "Plano não encontrado.");
  await db.$transaction(async (tx) => {
    await tx.assinatura.update({ where: { id: a.id }, data: { planoId: plano.id } });
    await registrarAuditoria(tx, {
      empresaId: ator.empresaId, usuarioId: ator.id, acao: "SAAS_PLANO_ALTERADO", entidade: "Assinatura", entidadeId: a.id,
      antes: { plano: a.plano.codigo }, depois: { plano: plano.codigo, loja: empresaId },
    });
  });
  return { plano: plano.codigo };
}

export async function suspender(ator: Ator, empresaId: string, motivo: string, forcar: boolean, db: Db = prisma, agora = new Date()) {
  const a = await achar(db, empresaId);
  if (a.status === "SUSPENSA") throw new ApiError(422, "A loja já está suspensa.");
  if (a.plano.codigo === "INTERNO" && !forcar) throw new ApiError(422, "Loja interna: marque “forçar” se é isso mesmo que quer.");
  const impedimento = checarSuspensao(a, agora, forcar);
  if (impedimento) throw new ApiError(422, impedimento);
  await db.$transaction(async (tx) => {
    await tx.assinatura.update({ where: { id: a.id }, data: { status: "SUSPENSA", suspensaMotivo: motivo } });
    await registrarAuditoria(tx, {
      empresaId: ator.empresaId, usuarioId: ator.id, acao: "SAAS_LOJA_SUSPENSA", entidade: "Assinatura", entidadeId: a.id,
      antes: { status: a.status }, depois: { status: "SUSPENSA", motivo, forcar, loja: empresaId },
    });
  });
  return { status: "SUSPENSA" as const };
}

export async function reativar(ator: Ator, empresaId: string, db: Db = prisma) {
  const a = await achar(db, empresaId);
  if (a.status !== "SUSPENSA") throw new ApiError(422, "A loja não está suspensa.");
  // Volta ao que era: teste, se nunca contratou; senão ativa (o Asaas avisa se houver atraso).
  const volta: StatusAssinatura = a.trialFimEm && !a.asaasAssinaturaId ? "TRIAL" : "ATIVA";
  await db.$transaction(async (tx) => {
    await tx.assinatura.update({ where: { id: a.id }, data: { status: volta, suspensaMotivo: null, inadimplenteDesde: null } });
    await registrarAuditoria(tx, {
      empresaId: ator.empresaId, usuarioId: ator.id, acao: "SAAS_LOJA_REATIVADA", entidade: "Assinatura", entidadeId: a.id,
      antes: { status: a.status, motivo: a.suspensaMotivo }, depois: { status: volta, loja: empresaId },
    });
  });
  return { status: volta };
}
