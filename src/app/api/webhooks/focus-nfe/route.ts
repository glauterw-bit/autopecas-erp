import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { autenticarWebhookFocus } from "@/lib/nfe/webhook-focus";
import { sincronizarNota } from "@/lib/nfe/sincronizar";

// Gatilho (webhook) da Focus NFe para NF-e/NFC-e
// ===============================================
// Doc: https://doc.focusnfe.com.br/docs/webhooks — o corpo traz os mesmos
// dados da consulta (ref, status, cnpj_emitente, chave_nfe...). Responder
// 200 rápido; a Focus reenvia em caso de falha.
//
// Segurança: token no cabeçalho (src/lib/nfe/webhook-focus.ts), comparação em
// tempo constante. O corpo NÃO é confiado: usamos só o ref para achar a nota e
// reconsultamos a Focus (sincronizarNota), como no Pix.
// Idempotência: EventoWebhook (origem FOCUS_NFE, idExterno ref:status) e a
// própria sincronização, que só aplica o resultado em nota EMITINDO.
// Se algo falhar aqui, o job fiscal:nfe-consulta pega a nota na rodada seguinte.

export async function POST(req: NextRequest) {
  const auth = autenticarWebhookFocus(req.headers);
  if (!auth.ok) {
    if (auth.status === 503) console.error("[webhook-focus] FOCUS_WEBHOOK_TOKEN não configurado — rejeitando");
    return NextResponse.json({ erro: auth.status === 503 ? "indisponível" : "não autorizado" }, { status: auth.status });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ erro: "payload inválido" }, { status: 400 });
  }
  const ref = typeof body.ref === "string" ? body.ref.trim() : "";
  const status = typeof body.status === "string" ? body.status : "";
  const cnpj = typeof body.cnpj_emitente === "string" ? body.cnpj_emitente.replace(/\D/g, "") : "";
  if (!ref || ref.length > 100) return NextResponse.json({ erro: "payload inválido" }, { status: 400 });

  const idExterno = `${ref}:${status}`.slice(0, 200);
  try {
    await prisma.eventoWebhook.create({
      data: { origem: "FOCUS_NFE", idExterno, topico: status || null, recurso: ref, status: "PENDENTE" },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const anterior = await prisma.eventoWebhook.findUnique({
        where: { origem_idExterno: { origem: "FOCUS_NFE", idExterno } },
        select: { status: true },
      });
      // Já processado: não faz nada de novo. Se deu erro antes, tenta de novo.
      if (anterior && anterior.status !== "ERRO") return NextResponse.json({ ok: true, duplicado: true });
    } else {
      throw e;
    }
  }

  const nota = await prisma.notaFiscal.findFirst({
    where: { refProvedor: ref, ...(cnpj ? { empresa: { cnpj } } : {}) },
    orderBy: { dataEmissao: "desc" },
    select: { id: true, empresaId: true },
  });
  if (!nota) {
    await prisma.eventoWebhook.update({
      where: { origem_idExterno: { origem: "FOCUS_NFE", idExterno } },
      data: { status: "IGNORADO", processadoEm: new Date(), erro: "nota não encontrada" },
    });
    return NextResponse.json({ ok: true, ignorado: true });
  }
  try {
    const r = await sincronizarNota(nota.id, { empresaId: nota.empresaId });
    await prisma.eventoWebhook.update({
      where: { origem_idExterno: { origem: "FOCUS_NFE", idExterno } },
      data: { status: "PROCESSADO", empresaId: nota.empresaId, processadoEm: new Date(), tentativas: { increment: 1 } },
    });
    return NextResponse.json({ ok: true, status: r.status });
  } catch (e) {
    await prisma.eventoWebhook.update({
      where: { origem_idExterno: { origem: "FOCUS_NFE", idExterno } },
      data: { status: "ERRO", empresaId: nota.empresaId, erro: String((e as Error).message).slice(0, 300), tentativas: { increment: 1 } },
    });
    // 200 mesmo assim: o job de consulta resolve a nota; evita reentrega em loop.
    return NextResponse.json({ ok: true, pendente: true });
  }
}
