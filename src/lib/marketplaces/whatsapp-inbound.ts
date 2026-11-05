import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { conversarChat } from "../ai/chat";
import { ErroIA } from "../ai/uso";
import { mascarar } from "../ai/whatsapp-empresa";
import { LIMITES_IA } from "../ai/limite";
import { permitidoAsync } from "../auth/rate-limit";
import { enviarTexto } from "./whatsapp";

// Mensagem recebida do WhatsApp: registrar rápido, processar depois
// ===================================================================
// A Meta reentrega o webhook se a resposta demora ou falha. Por isso:
// 1) a rota grava a mensagem em EventoWebhook (origem WHATSAPP, idExterno =
//    message.id da Meta, único) e responde 200 na hora;
// 2) o processamento (IA + envio da resposta) roda depois, na fila quando há
//    REDIS_URL, ou logo após a resposta quando não há;
// 3) reentrega do mesmo message.id não cria evento novo, e o "claim"
//    PENDENTE/ERRO → PROCESSANDO garante que só uma execução responde.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components

export const ORIGEM_WHATSAPP = "WHATSAPP";

export interface MensagemRecebida {
  empresaId: string;
  contaId?: string | null;
  phoneNumberId: string;
  messageId: string;
  de: string;
  texto: string;
}

export async function registrarMensagemWhatsapp(m: MensagemRecebida): Promise<{ novo: boolean; eventoId: string }> {
  const chave = { origem_idExterno: { origem: ORIGEM_WHATSAPP, idExterno: m.messageId } };
  const ja = await prisma.eventoWebhook.findUnique({ where: chave, select: { id: true } });
  if (ja) return { novo: false, eventoId: ja.id };
  try {
    const ev = await prisma.eventoWebhook.create({
      data: {
        origem: ORIGEM_WHATSAPP,
        idExterno: m.messageId,
        empresaId: m.empresaId,
        contaId: m.contaId ?? null,
        topico: "messages",
        status: "PENDENTE",
        payload: { phoneNumberId: m.phoneNumberId, de: m.de, texto: m.texto } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return { novo: true, eventoId: ev.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const ex = await prisma.eventoWebhook.findUniqueOrThrow({ where: chave, select: { id: true } });
      return { novo: false, eventoId: ex.id };
    }
    throw e;
  }
}

/** Processa uma mensagem registrada. Devolve um rótulo do que aconteceu. */
export async function processarMensagemWhatsapp(eventoId: string): Promise<string> {
  const claim = await prisma.eventoWebhook.updateMany({
    where: { id: eventoId, origem: ORIGEM_WHATSAPP, status: { in: ["PENDENTE", "ERRO"] } },
    data: { status: "PROCESSANDO", tentativas: { increment: 1 } },
  });
  if (claim.count === 0) return "ignorado";

  const ev = await prisma.eventoWebhook.findUniqueOrThrow({ where: { id: eventoId } });
  const p = (ev.payload ?? {}) as { phoneNumberId?: string; de?: string; texto?: string };
  const empresaId = ev.empresaId;
  if (!empresaId || !p.de || !p.texto) {
    await prisma.eventoWebhook.update({
      where: { id: ev.id },
      data: { status: "IGNORADO", erro: "evento sem empresa ou texto", processadoEm: new Date() },
    });
    return "ignorado";
  }

  try {
    const resultado = await responder({ empresaId, phoneNumberId: p.phoneNumberId, de: p.de, texto: p.texto });
    await prisma.eventoWebhook.update({
      where: { id: ev.id },
      data: { status: "PROCESSADO", processadoEm: new Date(), erro: resultado },
    });
    return resultado;
  } catch (e) {
    await prisma.eventoWebhook.update({
      where: { id: ev.id },
      data: { status: "ERRO", erro: String((e as Error).message ?? "erro").slice(0, 300) },
    });
    throw e;
  }
}

async function responder(a: { empresaId: string; phoneNumberId?: string; de: string; texto: string }): Promise<string> {
  const { empresaId, de } = a;
  const { limite, janelaMs } = LIMITES_IA.whatsapp;
  if (!(await permitidoAsync(`ia:whatsapp:${empresaId}:${de}`, limite, janelaMs))) {
    console.warn("[whatsapp] limite de mensagens por contato atingido", { de: mascarar(de) });
    return "limite";
  }
  const cliente = await prisma.cliente.findFirst({
    where: { empresaId, whatsapp: { contains: de } },
    select: { id: true },
  });
  const conversa = await prisma.conversaIA.create({
    data: { canal: "WHATSAPP", clienteId: cliente?.id, identificadorExterno: de },
  });
  let resposta: string;
  try {
    ({ resposta } = await conversarChat({
      empresaId,
      conversaId: conversa.id,
      mensagemUsuario: a.texto,
      contexto: { canal: "WHATSAPP", clienteIdDoCanal: cliente?.id ?? null },
    }));
  } catch (e) {
    // Teto de custo, IA desligada ou falha da OpenAI: não responde sozinho; fica para atendimento humano.
    console.warn("[whatsapp] IA não respondeu", {
      de: mascarar(de),
      motivo: e instanceof ErroIA ? e.message : "erro na IA",
    });
    await prisma.mensagemIA.create({ data: { conversaId: conversa.id, papel: "USUARIO", conteudo: a.texto } });
    await prisma.conversaIA.update({ where: { id: conversa.id }, data: { transferidaParaHumano: true } });
    return "humano";
  }
  await prisma.mensagemIA.createMany({
    data: [
      { conversaId: conversa.id, papel: "USUARIO", conteudo: a.texto },
      { conversaId: conversa.id, papel: "ASSISTENTE", conteudo: resposta },
    ],
  });
  try {
    await enviarTexto({ para: de, texto: resposta, empresaId, phoneNumberId: a.phoneNumberId });
  } catch (e) {
    // Não relança: repetir o job chamaria a IA de novo e cobraria duas vezes.
    console.error("[whatsapp] falha ao responder", mascarar(de), (e as Error).message);
    return "respondido-sem-envio";
  }
  return "respondido";
}
