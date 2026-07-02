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
// A rota /api/pix/cobranca gera o txid (gerarTxid(), prefixo "AP") e o devolve
// ao PDV/frontend, mas NÃO o persiste. O vínculo no recebimento usa os dois
// campos onde o txid é gravado pelo fluxo financeiro:
//   1) ContaReceber.documento — mesmo campo que a conciliação OFX usa como
//      identificador externo (src/lib/financeiro/conciliacao.ts, "PIX por txid");
//   2) PagamentoVenda.nsuAutorizacao — campo de autorização externa do
//      pagamento da venda (equivalente ao NSU de cartão; para Pix, o txid).
// Quem cria a cobrança deve gravar o txid retornado num desses campos.
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
    const documentoMovimento = p.endToEndId ?? p.txid;
    const dataPagamento = p.horario ? new Date(p.horario) : new Date();

    // Idempotência: PSPs reenviam callbacks — se o endToEndId (ou txid) já
    // gerou movimento de caixa, respondemos ok sem duplicar.
    const jaProcessado = await prisma.movimentoCaixa.findFirst({
      where: { documento: documentoMovimento, formaPagamento: "PIX" },
      select: { id: true },
    });
    if (jaProcessado) {
      processados++;
      continue;
    }

    // 1) ContaReceber com documento == txid (cobrança avulsa/crediário).
    const conta = await prisma.contaReceber.findFirst({
      where: {
        documento: p.txid,
        status: { in: ["ABERTO", "PARCIALMENTE_PAGO", "ATRASADO"] },
      },
    });
    if (conta) {
      const novoRecebido = Number(conta.valorRecebido) + valor;
      const totalDevido =
        Number(conta.valor) +
        Number(conta.juros) +
        Number(conta.multa) -
        Number(conta.desconto);
      const quitou = novoRecebido >= totalDevido - 0.005; // tolerância de centavo
      await prisma.$transaction([
        prisma.contaReceber.update({
          where: { id: conta.id },
          data: {
            valorRecebido: { increment: valor },
            status: quitou ? "PAGO" : "PARCIALMENTE_PAGO",
            dataRecebimento: quitou ? dataPagamento : conta.dataRecebimento,
          },
        }),
        prisma.movimentoCaixa.create({
          data: {
            empresaId: conta.empresaId,
            contaBancariaId: conta.contaBancariaId,
            tipo: "ENTRADA",
            formaPagamento: "PIX",
            valor,
            descricao: `Pix recebido — ${conta.descricao} (txid ${p.txid})`,
            documento: documentoMovimento,
            data: dataPagamento,
          },
        }),
      ]);
      processados++;
      continue;
    }

    // 2) PagamentoVenda com nsuAutorizacao == txid (Pix do PDV).
    const pagamento = await prisma.pagamentoVenda.findFirst({
      where: { nsuAutorizacao: p.txid, formaPagamento: "PIX" },
      include: {
        venda: { select: { empresaId: true, numero: true } },
      },
    });
    if (pagamento) {
      await prisma.movimentoCaixa.create({
        data: {
          empresaId: pagamento.venda.empresaId,
          contaBancariaId: pagamento.contaBancariaId,
          tipo: "ENTRADA",
          formaPagamento: "PIX",
          valor,
          descricao: `Pix recebido — Venda #${pagamento.venda.numero} (txid ${p.txid})`,
          documento: documentoMovimento,
          data: dataPagamento,
        },
      });
      processados++;
      continue;
    }

    // Nada encontrado — registramos e seguimos (200 evita reenvio eterno).
    console.warn(`[webhook-pix] txid sem vínculo: ${p.txid} (R$ ${valor})`);
    ignorados++;
  }

  if (processados === 0) {
    return NextResponse.json({ ignorado: true });
  }
  return NextResponse.json({ ok: true, processados, ignorados });
}
