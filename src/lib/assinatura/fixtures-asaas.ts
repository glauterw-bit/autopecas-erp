// Corpos de webhook no formato do Asaas (fictícios), para os testes. Nunca chamam o Asaas real.
import type { EventoAsaas } from "./webhook";

export function eventoPagamento(
  event: "PAYMENT_CONFIRMED" | "PAYMENT_RECEIVED" | "PAYMENT_OVERDUE",
  o: { id: string; assinatura: string; cliente: string; vencimento?: string; status?: string },
): EventoAsaas {
  return {
    id: o.id,
    event,
    payment: {
      id: "pay_" + o.id,
      customer: o.cliente,
      subscription: o.assinatura,
      dueDate: o.vencimento ?? "2026-11-10",
      status: o.status ?? (event === "PAYMENT_OVERDUE" ? "OVERDUE" : event === "PAYMENT_CONFIRMED" ? "CONFIRMED" : "RECEIVED"),
    },
  };
}

export function eventoAssinatura(
  event: "SUBSCRIPTION_DELETED" | "SUBSCRIPTION_INACTIVATED",
  o: { id: string; assinatura: string; cliente: string },
): EventoAsaas {
  return { id: o.id, event, subscription: { id: o.assinatura, customer: o.cliente } };
}
