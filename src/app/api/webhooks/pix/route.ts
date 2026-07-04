import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

// Webhook Pix (callback dos PSPs no padrão BACEN — Manual de APIs Pix)
// ====================================================================
// O PSP chama este endpoint quando uma cobrança é liquidada:
//   POST ?token=WEBHOOK_TOKEN  body: { pix: [{ txid, valor, horario, endToEndId }] }
//
// Segurança: mesmo padrão de /api/webhooks/marketplaces — token secreto na
// query comparado com timingSafeEqual contra process.env.WEBHOOK_TOKEN.
//
// Vínculo do txid
// ---------------
// A rota /api/pix/cobranca gera o txid (gerarTxid(), prefixo "AP") e o grava
// em ContaReceber.documento e PagamentoVenda.nsuAutorizacao. O recebimento
// casa por esses campos.
//
// Idempotência: cada Pix processado gera MovimentoCaixa com documento = txid
// (estável — o PSP pode reenviar com ou sem endToEndId). A checagem cobre
// txid E endToEndId (movimentos antigos gravados com endToEndId) e roda
// DENTRO da transação, serializada por advisory lock por txid — dois
// callbacks concorrentes do mesmo Pix não geram baixa dupla.
//
// Se nada casar, respondemos 200 {ignorado: true} — o PSP não deve reenviar
// eternamente um evento que não conseguimos vincular (fica na trilha do PSP).

const pixSchema = z.object({
  pix: z
    .array(
      z.object({
        txid: z.string().min(1),
        valor: z.union([z.string(), z.number()]),
        horario: z.string().optional(),
        endToEndId: z.string().optional(),
      }),
    )
    .min(1),
});

// Formato do txid gerado pelo sistema (gerarTxid em src/lib/pagamentos/pix.ts):
// "AP" + hex — 24 chars hoje; a faixa 22-33 após o prefixo tolera variações
// até o limite BACEN de 35. Um txid fora deste formato só é aceito se o valor
// também casar (reduz colisão cross-tenant em ContaReceber.documento).
const TXID_SISTEMA = /^AP[0-9A-Za-z]{22,33}$/;

const valorCasa = (recebido: number, esperado: number) =>
  esperado > 0 && Math.abs(recebido - esperado) <= esperado * 0.01;

// Alguns PSPs validam a URL do webhook com um GET antes de ativar o callback.
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const esperado = process.env.WEBHOOK_TOKEN;
  if (!esperado) {
    console.error("[webhook-pix] WEBHOOK_TOKEN não configurado — rejeitando");
    return NextResponse.json({ erro: "não configurado" }, { status: 503 });
  }
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (
    token.length !== esperado.length ||
    !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(esperado))
  ) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "payload inválido" }, { status: 400 });
  }
  const parsed = pixSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ erro: "payload inválido" }, { status: 400 });
  }

  let processados = 0;
  let ignorados = 0;

  for (const p of parsed.data.pix) {
    const valor = Number(p.valor);
    if (!Number.isFinite(valor) || valor <= 0) {
      ignorados++;
      continue;
    }
    const documentos = [p.txid, p.endToEndId].filter((d): d is string => Boolean(d));
    const dataPagamento = p.horario ? new Date(p.horario) : new Date();
    const txidConfiavel = TXID_SISTEMA.test(p.txid);

    const resultado = await prisma.$transaction(async (tx) => {
      // Serializa callbacks concorrentes do mesmo txid.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"pix:" + p.txid}))`;

      // Idempotência (re-checada sob o lock): casa por txid E endToEndId.
      const jaProcessado = await tx.movimentoCaixa.findFirst({
        where: { documento: { in: documentos }, formaPagamento: "PIX" },
        select: { id: true },
      });
      if (jaProcessado) return "processado" as const;

      // 1) ContaReceber com documento == txid (cobrança avulsa/crediário).
      const conta = await tx.contaReceber.findFirst({
        where: {
          documento: p.txid,
          status: { in: ["ABERTO", "PARCIALMENTE_PAGO", "ATRASADO"] },
        },
        include: {
          venda: {
            select: {
              clienteId: true,
              pagamentos: { select: { formaPagamento: true } },
            },
          },
        },
      });

      // 2) PagamentoVenda com nsuAutorizacao == txid (Pix do PDV).
      const pagamento = await tx.pagamentoVenda.findFirst({
        where: { nsuAutorizacao: p.txid, formaPagamento: "PIX" },
        include: {
          venda: { select: { empresaId: true, numero: true } },
        },
      });

      const totalDevido = conta
        ? Number(conta.valor) + Number(conta.juros) + Number(conta.multa) - Number(conta.desconto)
        : 0;
      const restanteConta = conta ? totalDevido - Number(conta.valorRecebido) : 0;

      // txid fora do formato do sistema: exige valor compatível (1%).
      const contaOk = !!conta && (txidConfiavel || valorCasa(valor, restanteConta));
      const pagamentoOk =
        !!pagamento && (txidConfiavel || valorCasa(valor, Number(pagamento.valor)));

      if (
        conta &&
        pagamento &&
        contaOk &&
        pagamentoOk &&
        conta.empresaId !== pagamento.venda.empresaId
      ) {
        console.warn(
          `[webhook-pix] ALERTA: txid ${p.txid} casa ContaReceber (empresa ${conta.empresaId}) e PagamentoVenda (empresa ${pagamento.venda.empresaId}) em empresas diferentes — priorizando ContaReceber`,
        );
      }

      if (conta && contaOk) {
        const novoRecebido = Number(conta.valorRecebido) + valor;
        const quitou = novoRecebido >= totalDevido - 0.005; // tolerância de centavo
        await tx.contaReceber.update({
          where: { id: conta.id },
          data: {
            valorRecebido: { increment: valor },
            status: quitou ? "PAGO" : "PARCIALMENTE_PAGO",
            dataRecebimento: quitou ? dataPagamento : conta.dataRecebimento,
          },
        });
        await tx.movimentoCaixa.create({
          data: {
            empresaId: conta.empresaId,
            contaBancariaId: conta.contaBancariaId,
            tipo: "ENTRADA",
            formaPagamento: "PIX",
            valor,
            descricao: `Pix recebido — ${conta.descricao} (txid ${p.txid})`,
            // documento = txid (estável): reenvio sem endToEndId continua idempotente.
            documento: p.txid,
            data: dataPagamento,
          },
        });

        // Crediário: baixar a parcela devolve limite ao cliente.
        const clienteId = conta.clienteId ?? conta.venda?.clienteId;
        const ehCrediario =
          conta.formaPagamento === "CREDIARIO" ||
          conta.venda?.pagamentos.some((pg) => pg.formaPagamento === "CREDIARIO");
        if (clienteId && ehCrediario) {
          const upd = await tx.cliente.updateMany({
            where: { id: clienteId, saldoDevedor: { gte: valor } },
            data: { saldoDevedor: { decrement: valor } },
          });
          if (upd.count === 0) {
            // Saldo menor que o valor baixado: zera em vez de deixar negativo.
            await tx.cliente.updateMany({
              where: { id: clienteId },
              data: { saldoDevedor: 0 },
            });
          }
        }
        return "processado" as const;
      }

      if (pagamento && pagamentoOk) {
        const valorEsperado = Number(pagamento.valor);
        if (Math.abs(valor - valorEsperado) > 0.01) {
          await tx.insightIA.create({
            data: {
              empresaId: pagamento.venda.empresaId,
              tipo: "FRAUDE_POTENCIAL",
              severidade: "AVISO",
              titulo: `Pix com valor divergente — Venda #${pagamento.venda.numero}`,
              descricao: `Pix txid ${p.txid} recebido com R$ ${valor.toFixed(2)}, mas o pagamento da venda registra R$ ${valorEsperado.toFixed(2)}.`,
              acaoSugerida: "Conferir o extrato e ajustar o pagamento da venda ou estornar a diferença.",
              dadosReferencia: {
                txid: p.txid,
                valorRecebido: valor,
                valorPagamento: valorEsperado,
                pagamentoVendaId: pagamento.id,
              },
            },
          });
        }
        await tx.movimentoCaixa.create({
          data: {
            empresaId: pagamento.venda.empresaId,
            contaBancariaId: pagamento.contaBancariaId,
            tipo: "ENTRADA",
            formaPagamento: "PIX",
            valor,
            descricao: `Pix recebido — Venda #${pagamento.venda.numero} (txid ${p.txid})`,
            documento: p.txid,
            data: dataPagamento,
          },
        });
        return "processado" as const;
      }

      return "ignorado" as const;
    });

    if (resultado === "processado") {
      processados++;
    } else {
      // Nada encontrado (ou valor incompatível com txid não confiável).
      console.warn(`[webhook-pix] txid sem vínculo aceito: ${p.txid} (R$ ${valor})`);
      ignorados++;
    }
  }

  if (processados === 0) {
    return NextResponse.json({ ignorado: true });
  }
  return NextResponse.json({ ok: true, processados, ignorados });
}
