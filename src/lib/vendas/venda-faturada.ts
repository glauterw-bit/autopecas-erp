import { Prisma } from "@prisma/client";

// O que conta como venda
// ======================
// Só conta venda concluída: tipo VENDA com status PAGA ou FATURADA.
// Orçamento, pré-venda, condicional aberta, cancelada e devolvida NÃO contam
// (CLAUDE.md: "Venda só conta quando estiver faturada, não orçamento").
// Condicional que o cliente ficou vira tipo VENDA/PAGA e passa a contar.

export const STATUS_VENDA_FATURADA = ["PAGA", "FATURADA"] as const;

export const filtroVendaFaturada = {
  tipo: "VENDA",
  status: { in: [...STATUS_VENDA_FATURADA] },
} satisfies Prisma.VendaWhereInput;

/** Fragmento SQL cru (alias da tabela vendas = v). */
export const sqlVendaFaturada = Prisma.sql`v.tipo = 'VENDA' AND v.status IN ('PAGA', 'FATURADA')`;

export function ehVendaFaturada(v: { tipo: string; status: string }): boolean {
  return v.tipo === "VENDA" && (STATUS_VENDA_FATURADA as readonly string[]).includes(v.status);
}
