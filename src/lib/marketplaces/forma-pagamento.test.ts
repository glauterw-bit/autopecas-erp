import { describe, expect, it } from "vitest";
import { formaPagamentoDoMarketplace, formaPagamentoVallente, pagamentoPrincipalML } from "./forma-pagamento";

describe("forma de pagamento do marketplace", () => {
  it.each([
    ["credit_card", "visa", "CREDITO"],
    ["debit_card", "debvisa", "DEBITO"],
    ["bank_transfer", "pix", "PIX"],
    ["ticket", "bolbradesco", "BOLETO"],
    ["account_money", "account_money", "TRANSFERENCIA"],
    [undefined, "pix", "PIX"],
    [undefined, "master", "CREDITO"],
    [undefined, "debmaster", "DEBITO"],
    [undefined, "mercadopago", "TRANSFERENCIA"],
    [undefined, undefined, "TRANSFERENCIA"],
  ])("%s / %s -> %s", (tipo, metodo, esperado) => {
    expect(formaPagamentoDoMarketplace(tipo, metodo)).toBe(esperado);
  });

  it("pedido ML: usa o pagamento aprovado, com parcelas e bandeira", () => {
    const r = pagamentoPrincipalML([
      { status: "rejected", payment_type: "credit_card", payment_method_id: "master", installments: 1 },
      { status: "approved", payment_type: "credit_card", payment_method_id: "visa", installments: 3 },
    ]);
    expect(r).toEqual({ forma: "CREDITO", bandeira: "visa", parcelas: 3 });
  });

  it("pedido sem pagamento listado não vira PIX por chute", () => {
    expect(pagamentoPrincipalML(undefined).forma).toBe("TRANSFERENCIA");
  });
});

describe("forma de pagamento do Vallente (compatível com o comportamento antigo)", () => {
  it.each([
    [undefined, "PIX"],
    ["", "PIX"],
    ["  ", "PIX"],
    ["pix", "PIX"],
    ["mercadopago", "PIX"],
    ["xyz", "PIX"],
    ["credit_card", "CREDITO"],
    ["visa", "CREDITO"],
    ["debit_card", "DEBITO"],
    ["boleto", "BOLETO"],
    ["ticket", "BOLETO"],
    ["bank_transfer", "TRANSFERENCIA"],
  ])("%s -> %s", (entrada, esperado) => {
    expect(formaPagamentoVallente(entrada)).toBe(esperado);
  });
});
