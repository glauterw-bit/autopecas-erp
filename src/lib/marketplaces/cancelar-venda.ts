import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as prismaPadrao } from "../db";

// Pedido de marketplace cancelado depois de importado
// ===================================================
// - Venda ainda sem nota autorizada: vira CANCELADA, o estoque volta pelo
//   kardex (ENTRADA, origem CANCELAMENTO_VENDA), as contas a receber abertas
//   são canceladas e tudo vai para o LogAuditoria com antes e depois.
// - Venda com nota autorizada (ou faturada): NÃO mexe na nota nem no estoque.
//   Marca o pedido para revisão humana e abre alerta. Cancelar nota tem prazo
//   e regra fiscal; quem decide é a pessoa.
// - Idempotente: a transição de status é uma troca condicional (updateMany) e
//   o estorno só roda quando ela vence. Reentrega do webhook não duplica nada.

export type ResultadoCancelamento =
  | { status: "SEM_VENDA" }
  | { status: "JA_CANCELADA"; vendaId: string }
  | { status: "CANCELADA"; vendaId: string; itensDevolvidos: number; contasCanceladas: number }
  | { status: "REVISAO_HUMANA"; vendaId: string; motivo: string };

// O enum de status do pedido não tem "revisão"; a marca fica na observação (sem migração).
export const MARCA_REVISAO = "REVISAO_CANCELAMENTO:";
const CANCELAVEIS = ["ABERTA", "AGUARDANDO_PAGAMENTO", "PAGA"] as const;

export async function cancelarVendaMarketplace(
  args: { empresaId: string; contaId: string; pedidoIdExterno: string; externoId: string },
  db: PrismaClient = prismaPadrao,
): Promise<ResultadoCancelamento> {
  const { empresaId, contaId, pedidoIdExterno, externoId } = args;
  const venda = await db.venda.findFirst({
    where: { empresaId, externoId },
    select: { id: true, status: true, numero: true, notaFiscal: { select: { status: true } } },
  });
  if (!venda) return { status: "SEM_VENDA" };
  if (venda.status === "CANCELADA" || venda.status === "DEVOLVIDA") {
    return { status: "JA_CANCELADA", vendaId: venda.id };
  }

  const notaViva = venda.notaFiscal && ["AUTORIZADA", "EMITINDO"].includes(venda.notaFiscal.status);
  if (notaViva || venda.status === "FATURADA") {
    const motivo = notaViva
      ? `Pedido ${pedidoIdExterno} cancelado no marketplace, mas a venda #${venda.numero} já tem nota fiscal (${venda.notaFiscal!.status}).`
      : `Pedido ${pedidoIdExterno} cancelado no marketplace, mas a venda #${venda.numero} já está faturada.`;
    const registro = await db.marketplacePedido.findUnique({
      where: { contaId_pedidoIdExterno: { contaId, pedidoIdExterno } },
      select: { id: true, observacao: true },
    });
    if (!registro?.observacao?.startsWith(MARCA_REVISAO)) {
      await db.$transaction(async (tx) => {
        if (registro) {
          await tx.marketplacePedido.update({
            where: { id: registro.id },
            data: { observacao: `${MARCA_REVISAO} ${motivo}`.slice(0, 500) },
          });
        }
        await tx.insightIA.create({
          data: {
            empresaId,
            tipo: "CADASTRO_DUPLICADO",
            severidade: "CRITICO",
            titulo: `Pedido cancelado com nota fiscal emitida (venda #${venda.numero})`,
            descricao: `${motivo} O sistema não cancelou a nota nem devolveu o estoque.`,
            acaoSugerida:
              "Conferir com o contador se cabe cancelar a nota (há prazo) ou fazer nota de devolução, e então devolver o estoque.",
            dadosReferencia: { contaId, pedidoIdExterno, vendaId: venda.id } as Prisma.InputJsonValue,
          },
        });
        await tx.logAuditoria.create({
          data: {
            acao: "CANCELAMENTO_MARKETPLACE_REVISAO",
            entidade: "Venda",
            entidadeId: venda.id,
            dadosAntes: { status: venda.status, nota: venda.notaFiscal?.status ?? null } as Prisma.InputJsonValue,
            dadosDepois: { status: venda.status, revisaoHumana: true, pedidoIdExterno } as Prisma.InputJsonValue,
          },
        });
      });
    }
    return { status: "REVISAO_HUMANA", vendaId: venda.id, motivo };
  }

  return db.$transaction(async (tx) => {
    // Quem vencer esta troca faz o estorno; reentrega concorrente vê count 0.
    const troca = await tx.venda.updateMany({
      where: { id: venda.id, status: { in: [...CANCELAVEIS] } },
      data: {
        status: "CANCELADA",
        canceladaEm: new Date(),
        motivoCancelamento: `Pedido ${pedidoIdExterno} cancelado no marketplace`,
      },
    });
    if (troca.count === 0) return { status: "JA_CANCELADA" as const, vendaId: venda.id };

    const saidas = await tx.movimentoEstoque.findMany({
      where: { origemTipo: "VENDA", origemId: venda.id, tipo: "SAIDA" },
    });
    for (const mov of saidas) {
      await tx.estoqueDeposito.upsert({
        where: { produtoId_depositoId: { produtoId: mov.produtoId, depositoId: mov.depositoId } },
        create: { produtoId: mov.produtoId, depositoId: mov.depositoId, quantidade: mov.quantidade },
        update: { quantidade: { increment: mov.quantidade } },
      });
      await tx.movimentoEstoque.create({
        data: {
          produtoId: mov.produtoId,
          depositoId: mov.depositoId,
          tipo: "ENTRADA",
          quantidade: mov.quantidade,
          custoUnitario: mov.custoUnitario,
          origemTipo: "CANCELAMENTO_VENDA",
          origemId: venda.id,
          documento: mov.documento,
          observacao: `Estorno: pedido ${pedidoIdExterno} cancelado no marketplace`,
        },
      });
    }

    const contas = await tx.contaReceber.updateMany({
      where: { empresaId, vendaId: venda.id, status: { in: ["ABERTO", "ATRASADO", "PARCIALMENTE_PAGO"] } },
      data: { status: "CANCELADO" },
    });

    await tx.marketplacePedido.updateMany({
      where: { contaId, pedidoIdExterno },
      data: { statusInterno: "CANCELADO", observacao: null },
    });
    await tx.logAuditoria.create({
      data: {
        acao: "VENDA_CANCELADA_MARKETPLACE",
        entidade: "Venda",
        entidadeId: venda.id,
        dadosAntes: { status: venda.status } as Prisma.InputJsonValue,
        dadosDepois: {
          status: "CANCELADA",
          pedidoIdExterno,
          itensDevolvidosAoEstoque: saidas.length,
          contasReceberCanceladas: contas.count,
        } as Prisma.InputJsonValue,
      },
    });
    return {
      status: "CANCELADA" as const,
      vendaId: venda.id,
      itensDevolvidos: saidas.length,
      contasCanceladas: contas.count,
    };
  });
}
