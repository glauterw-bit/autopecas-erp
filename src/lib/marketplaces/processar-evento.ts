import { prisma } from "../db";
import { MercadoLivreAdapter } from "./mercado-livre";
import { importarPedidoML } from "./pedido-ml";

// Processa um EventoWebhook gravado pela rota /api/webhooks/marketplaces.
// Roda no worker (fila marketplaces:sync, job "webhook") e no sync de 15 min
// para os pendentes (quando a fila estava fora). Idempotente: o evento só é
// processado se estiver PENDENTE/ERRO, e a venda é única por externoId.

const MAX_TENTATIVAS = 5;

/** "/orders/2000001234" → "2000001234" */
export function idDoPedidoML(recurso: string | null | undefined): string | null {
  const m = recurso?.match(/^\/?orders\/(\d+)/);
  return m ? m[1]! : null;
}

export async function processarEventoWebhook(eventoId: string): Promise<string> {
  const ev = await prisma.eventoWebhook.findUnique({ where: { id: eventoId } });
  if (!ev || !["PENDENTE", "ERRO"].includes(ev.status) || !ev.contaId) return "ignorado";

  try {
    let resultado = "sem ação";
    if (ev.origem === "MERCADO_LIVRE" && (ev.topico === "orders_v2" || ev.topico === "orders")) {
      const orderId = idDoPedidoML(ev.recurso);
      if (orderId) {
        // Nunca confiar no corpo do aviso: o pedido vem da API, com o token da conta.
        const ml = new MercadoLivreAdapter(ev.contaId);
        const pedido = await ml.buscarPedido(orderId);
        resultado = (await importarPedidoML(ev.contaId, pedido)).status;
      }
    }
    // Demais tópicos (items, questions, Shopee, Magalu): o sync periódico
    // da conta já cobre; o evento fica como trilha.
    await prisma.eventoWebhook.update({
      where: { id: ev.id },
      data: { status: "PROCESSADO", processadoEm: new Date(), erro: resultado, tentativas: { increment: 1 } },
    });
    return resultado;
  } catch (e) {
    const tentativas = ev.tentativas + 1;
    await prisma.eventoWebhook.update({
      where: { id: ev.id },
      data: {
        status: tentativas >= MAX_TENTATIVAS ? "FALHOU" : "ERRO",
        tentativas,
        erro: String((e as Error).message ?? "erro").slice(0, 300),
      },
    });
    throw e;
  }
}

export async function processarEventosPendentes(limite = 100) {
  const pendentes = await prisma.eventoWebhook.findMany({
    where: { status: { in: ["PENDENTE", "ERRO"] }, contaId: { not: null }, tentativas: { lt: MAX_TENTATIVAS } },
    orderBy: { recebidoEm: "asc" },
    take: limite,
    select: { id: true },
  });
  let ok = 0;
  let falhas = 0;
  for (const p of pendentes) {
    try {
      await processarEventoWebhook(p.id);
      ok++;
    } catch {
      falhas++;
    }
  }
  return { ok, falhas };
}
