import { describe, expect, it } from "vitest";
import { assinarShopee, assinaturaHexConfere, normalizarEvento, verificarAssinaturaShopee } from "./webhook";

const CHAVE = "partner-key-de-teste";
const URL = "https://erp.exemplo.com.br/api/webhooks/marketplaces?token=t&plataforma=shopee";
const CORPO = JSON.stringify({ shop_id: 123, code: 3, timestamp: 1730000000, data: { ordersn: "X1" } });

describe("assinatura da Shopee (HMAC-SHA256)", () => {
  it("aceita assinatura válida", () => {
    const sig = assinarShopee(CHAVE, URL, CORPO);
    expect(verificarAssinaturaShopee({ partnerKey: CHAVE, assinatura: sig, corpo: CORPO, urlsCandidatas: [URL] })).toBe(true);
  });
  it("aceita a variante sem query string quando é a cadastrada", () => {
    const semQuery = URL.split("?")[0]!;
    const sig = assinarShopee(CHAVE, semQuery, CORPO);
    expect(
      verificarAssinaturaShopee({ partnerKey: CHAVE, assinatura: sig, corpo: CORPO, urlsCandidatas: [URL, semQuery] }),
    ).toBe(true);
  });
  it("recusa corpo adulterado", () => {
    const sig = assinarShopee(CHAVE, URL, CORPO);
    const outro = CORPO.replace("X1", "X2");
    expect(verificarAssinaturaShopee({ partnerKey: CHAVE, assinatura: sig, corpo: outro, urlsCandidatas: [URL] })).toBe(false);
  });
  it("recusa chave errada, assinatura vazia e tamanho diferente", () => {
    const sig = assinarShopee("outra-chave", URL, CORPO);
    expect(verificarAssinaturaShopee({ partnerKey: CHAVE, assinatura: sig, corpo: CORPO, urlsCandidatas: [URL] })).toBe(false);
    expect(verificarAssinaturaShopee({ partnerKey: CHAVE, assinatura: null, corpo: CORPO, urlsCandidatas: [URL] })).toBe(false);
    expect(assinaturaHexConfere("abc", "abcd")).toBe(false);
  });
});

describe("normalização do evento", () => {
  it("ML usa _id e user_id", () => {
    const ev = normalizarEvento("MERCADO_LIVRE", "", { _id: "n-1", user_id: 999, topic: "orders_v2", resource: "/orders/1" });
    expect(ev).toMatchObject({ idExterno: "n-1", contaExternaId: "999", topico: "orders_v2", recurso: "/orders/1" });
  });
  it("Shopee: mesmo corpo → mesmo id (reentrega idempotente)", () => {
    const a = normalizarEvento("SHOPEE", CORPO, JSON.parse(CORPO));
    const b = normalizarEvento("SHOPEE", CORPO, JSON.parse(CORPO));
    expect(a.idExterno).toBe(b.idExterno);
    expect(a.contaExternaId).toBe("123");
  });
});
