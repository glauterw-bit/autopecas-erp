import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/auth/guard";

// Regras de crediário e helpers compartilhados entre POST /api/vendas
// e POST /api/vendas/[id]/condicional (faturamento de condicional).

export const pagamentoSchema = z.object({
  formaPagamento: z.enum([
    "DINHEIRO",
    "PIX",
    "DEBITO",
    "CREDITO",
    "CREDIARIO",
    "BOLETO",
    "CHEQUE",
    "VALE_PRESENTE",
    "TRANSFERENCIA",
  ]),
  valor: z.number().positive(),
  parcelas: z.number().int().positive().default(1),
  bandeira: z.string().optional(),
});

export type PagamentoInput = z.infer<typeof pagamentoSchema>;

export interface ClienteCredito {
  id: string;
  bloqueado: boolean;
  limiteCredito: Prisma.Decimal | number;
  saldoDevedor: Prisma.Decimal | number;
}

export function totalCrediario(pagamentos: PagamentoInput[]): number {
  return pagamentos
    .filter((p) => p.formaPagamento === "CREDIARIO")
    .reduce((a, p) => a + p.valor, 0);
}

/**
 * Valida cliente bloqueado e limite de crédito para o valor em crediário.
 * Lança ApiError 422 nas violações.
 */
export function validarCrediario(
  cliente: ClienteCredito | null | undefined,
  valorCrediario: number,
): void {
  if (valorCrediario <= 0) return;
  if (!cliente) {
    throw new ApiError(422, "Pagamento em crediário exige cliente identificado na venda.");
  }
  if (cliente.bloqueado) {
    throw new ApiError(422, "Cliente bloqueado por inadimplência — venda não permitida.");
  }
  const disponivel = Number(cliente.limiteCredito) - Number(cliente.saldoDevedor);
  if (disponivel + 0.005 < valorCrediario) {
    throw new ApiError(
      422,
      `Limite de crédito insuficiente: disponível R$ ${Math.max(0, disponivel).toFixed(2)}, crediário solicitado R$ ${valorCrediario.toFixed(2)}.`,
    );
  }
}

/**
 * Cria contas a receber para pagamentos parcelados (parcelas > 1),
 * com vencimentos a cada 30 dias. Usa a transação corrente.
 */
export async function criarContasReceberParceladas(
  tx: Prisma.TransactionClient,
  opts: {
    empresaId: string;
    clienteId: string | null;
    vendaId: string;
    numeroVenda: number;
    pagamentos: PagamentoInput[];
  },
): Promise<void> {
  for (const p of opts.pagamentos) {
    if (p.parcelas <= 1) continue;
    const valorParc = Number((p.valor / p.parcelas).toFixed(2));
    for (let i = 0; i < p.parcelas; i++) {
      const venc = new Date();
      venc.setDate(venc.getDate() + 30 * (i + 1));
      await tx.contaReceber.create({
        data: {
          empresaId: opts.empresaId,
          clienteId: opts.clienteId,
          vendaId: opts.vendaId,
          descricao: `Venda #${opts.numeroVenda} parcela ${i + 1}/${p.parcelas}`,
          formaPagamento: p.formaPagamento,
          parcela: i + 1,
          totalParcelas: p.parcelas,
          dataVencimento: venc,
          valor: valorParc,
        },
      });
    }
  }
}
