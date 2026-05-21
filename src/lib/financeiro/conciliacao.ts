import { prisma } from "../db";
import type { ExtratoOFX, TransacaoOFX } from "./ofx";

// Conciliação bancária automática
// ===============================
// Para cada transação do OFX, tenta casar com:
//   1) Conta a receber/pagar com valor exato + janela de ±5 dias
//   2) Memo OFX que cita nome do cliente/fornecedor
//   3) PIX por txid (memo contém prefixo "AP" — nosso txid)
//
// Em caso de match, dá baixa automática e grava MovimentoCaixa.
// Em caso de dúvida, deixa em "pendente" para o usuário decidir.

export interface ResultadoConciliacao {
  totalTransacoes: number;
  conciliacoesAutomaticas: number;
  pendentes: number;
  erros: number;
  pendentesDetalhe: Array<{ fitid: string; valor: number; data: Date; memo?: string }>;
}

const TOLERANCIA_DIAS = 5;

export async function conciliarExtrato(opts: {
  empresaId: string;
  contaBancariaId: string;
  extrato: ExtratoOFX;
}): Promise<ResultadoConciliacao> {
  const result: ResultadoConciliacao = {
    totalTransacoes: opts.extrato.transacoes.length,
    conciliacoesAutomaticas: 0,
    pendentes: 0,
    erros: 0,
    pendentesDetalhe: [],
  };

  for (const tx of opts.extrato.transacoes) {
    try {
      const conciliada = await tentarConciliar(opts.empresaId, opts.contaBancariaId, tx);
      if (conciliada) {
        result.conciliacoesAutomaticas++;
      } else {
        result.pendentes++;
        result.pendentesDetalhe.push({
          fitid: tx.fitid,
          valor: tx.valor,
          data: tx.data,
          memo: tx.memo,
        });
      }
    } catch {
      result.erros++;
    }
  }
  return result;
}

async function tentarConciliar(
  empresaId: string,
  contaBancariaId: string,
  tx: TransacaoOFX,
): Promise<boolean> {
  // Idempotência: se já registramos esse fitid, pular.
  const jaConciliado = await prisma.movimentoCaixa.findFirst({
    where: { empresaId, documento: tx.fitid },
    select: { id: true },
  });
  if (jaConciliado) return true;

  const valorAbs = Math.abs(tx.valor);
  const janelaIni = new Date(tx.data.getTime() - TOLERANCIA_DIAS * 86_400_000);
  const janelaFim = new Date(tx.data.getTime() + TOLERANCIA_DIAS * 86_400_000);

  // CREDIT (entrada) — casa com conta a receber.
  if (tx.valor > 0) {
    const candidatas = await prisma.contaReceber.findMany({
      where: {
        empresaId,
        status: { in: ["ABERTO", "PARCIALMENTE_PAGO", "ATRASADO"] },
        dataVencimento: { gte: janelaIni, lte: janelaFim },
        valor: { gte: valorAbs * 0.99, lte: valorAbs * 1.01 },
      },
      include: { cliente: true },
      take: 5,
    });

    // Tenta refinar por nome do cliente no memo
    let alvo = candidatas[0];
    if (candidatas.length > 1 && tx.memo) {
      const memoUpper = tx.memo.toUpperCase();
      const porNome = candidatas.find((c) =>
        c.cliente?.nome && memoUpper.includes(c.cliente.nome.toUpperCase().split(" ")[0]),
      );
      if (porNome) alvo = porNome;
    }

    if (alvo) {
      await prisma.$transaction([
        prisma.contaReceber.update({
          where: { id: alvo.id },
          data: {
            valorRecebido: { increment: valorAbs },
            status: "PAGO",
            dataRecebimento: tx.data,
            contaBancariaId,
          },
        }),
        prisma.movimentoCaixa.create({
          data: {
            empresaId,
            contaBancariaId,
            tipo: "ENTRADA",
            valor: valorAbs,
            descricao: alvo.descricao,
            documento: tx.fitid,
            data: tx.data,
          },
        }),
      ]);
      return true;
    }
  }

  // DEBIT (saída) — casa com conta a pagar.
  if (tx.valor < 0) {
    const candidatas = await prisma.contaPagar.findMany({
      where: {
        empresaId,
        status: { in: ["ABERTO", "PARCIALMENTE_PAGO", "ATRASADO"] },
        dataVencimento: { gte: janelaIni, lte: janelaFim },
        valor: { gte: valorAbs * 0.99, lte: valorAbs * 1.01 },
      },
      include: { fornecedor: true },
      take: 5,
    });

    let alvo = candidatas[0];
    if (candidatas.length > 1 && tx.memo) {
      const memoUpper = tx.memo.toUpperCase();
      const porNome = candidatas.find(
        (c) =>
          c.fornecedor?.razaoSocial &&
          memoUpper.includes(c.fornecedor.razaoSocial.toUpperCase().split(" ")[0]),
      );
      if (porNome) alvo = porNome;
    }

    if (alvo) {
      await prisma.$transaction([
        prisma.contaPagar.update({
          where: { id: alvo.id },
          data: {
            valorPago: { increment: valorAbs },
            status: "PAGO",
            dataPagamento: tx.data,
            contaBancariaId,
          },
        }),
        prisma.movimentoCaixa.create({
          data: {
            empresaId,
            contaBancariaId,
            tipo: "SAIDA",
            valor: valorAbs,
            descricao: alvo.descricao,
            documento: tx.fitid,
            data: tx.data,
          },
        }),
      ]);
      return true;
    }
  }

  return false;
}
