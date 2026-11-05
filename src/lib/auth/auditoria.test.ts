import { describe, it, expect, vi } from "vitest";
import { mascararParaLog, registrarAuditoria } from "./auditoria";

describe("auditoria sem documento completo", () => {
  it("mascara chaves de documento e sequências de CPF/CNPJ", () => {
    const r = mascararParaLog({
      cpf: "12345678901",
      obs: "cliente 123.456.789-01 e 12.345.678/0001-95",
      aninhado: { cnpj: "12345678000195", preco: 10 },
      lista: ["98765432100"],
    }) as Record<string, any>;
    expect(r.cpf).toBe("***");
    expect(r.obs).toBe("cliente *** e ***");
    expect(r.aninhado).toEqual({ cnpj: "***", preco: 10 });
    expect(r.lista).toEqual(["***"]);
  });
  it("não mexe em número de venda, preço e quantidade", () => {
    expect(mascararParaLog({ numero: 1234, preco: "199.90", sku: "ABC-123" })).toEqual({
      numero: 1234,
      preco: "199.90",
      sku: "ABC-123",
    });
  });
  it("grava pelo cliente recebido (mesma transação) com antes e depois", async () => {
    const create = vi.fn().mockResolvedValue({});
    await registrarAuditoria({ logAuditoria: { create } } as any, {
      empresaId: "e1",
      usuarioId: "u1",
      acao: "ESTOQUE_TRANSFERENCIA",
      entidade: "Produto",
      entidadeId: "p1",
      antes: { saldo: 10 },
      depois: { saldo: 7, cpf: "12345678901" },
    });
    const data = create.mock.calls[0][0].data;
    expect(data.usuarioId).toBe("u1");
    expect(data.dadosAntes).toEqual({ saldo: 10 });
    expect(data.dadosDepois).toEqual({ saldo: 7, cpf: "***" });
  });
});
