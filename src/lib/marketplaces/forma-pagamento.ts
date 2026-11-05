import type { FormaPagamento } from "@prisma/client";

// Forma de pagamento do pedido de marketplace → enum do ERP.
// ML: payment_type_id (credit_card, debit_card, account_money, ticket,
// bank_transfer, prepaid_card...) e payment_method_id (pix, visa, master,
// debvisa, bolbradesco...). Docs: https://developers.mercadolivre.com.br/pt_br/gerenciamento-de-vendas
// Sem correspondência exata, cai em TRANSFERENCIA (dinheiro que entra pelo
// marketplace) e o texto original vai em `bandeira` para conferência.

export function formaPagamentoDoMarketplace(tipo?: string | null, metodo?: string | null): FormaPagamento {
  const t = (tipo ?? "").toLowerCase().trim();
  const m = (metodo ?? "").toLowerCase().trim();
  if (m === "pix" || t === "pix") return "PIX";
  if (t === "credit_card" || t === "digital_currency") return "CREDITO";
  if (t === "debit_card" || t === "prepaid_card") return "DEBITO";
  if (t === "ticket" || t === "atm" || m.startsWith("bol")) return "BOLETO";
  if (t === "bank_transfer" || t === "account_money") return "TRANSFERENCIA";
  // Só o método (ex.: payload do Vallente): débito costuma começar com "deb".
  if (m.startsWith("deb")) return "DEBITO";
  if (["visa", "master", "mastercard", "amex", "elo", "hipercard", "diners", "credito", "credit"].includes(m)) {
    return "CREDITO";
  }
  return "TRANSFERENCIA";
}

/**
 * Vallente Hub: manda um texto só (`paymentMethod`), que pode ser o tipo
 * (credit_card, debit_card, ticket...) ou o método (pix, visa, bolbradesco...).
 * Vazio ou desconhecido continua PIX, como o endpoint sempre fez; só vira
 * TRANSFERENCIA quando o texto diz isso (bank_transfer, account_money).
 */
export function formaPagamentoVallente(paymentMethod?: string | null): FormaPagamento {
  const v = (paymentMethod ?? "").toLowerCase().trim();
  if (!v) return "PIX";
  const forma = formaPagamentoDoMarketplace(v, v);
  if (forma === "TRANSFERENCIA" && v !== "bank_transfer" && v !== "account_money") return "PIX";
  return forma;
}

export interface PagamentoMLRaw {
  status?: string;
  payment_type?: string;
  payment_type_id?: string;
  payment_method_id?: string;
  installments?: number;
}

/** Pagamento principal do pedido ML: o primeiro aprovado (ou o primeiro). */
export function pagamentoPrincipalML(payments: PagamentoMLRaw[] | undefined) {
  const lista = payments ?? [];
  const p = lista.find((x) => x.status === "approved") ?? lista[0];
  if (!p) return { forma: "TRANSFERENCIA" as FormaPagamento, bandeira: "mercadopago", parcelas: 1 };
  return {
    forma: formaPagamentoDoMarketplace(p.payment_type_id ?? p.payment_type, p.payment_method_id),
    bandeira: p.payment_method_id || "mercadopago",
    parcelas: p.installments && p.installments > 0 ? p.installments : 1,
  };
}
