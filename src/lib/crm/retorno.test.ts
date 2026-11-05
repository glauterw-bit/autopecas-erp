import { describe, it, expect } from "vitest";
import {
  RetornoInvalido,
  marcaRevisaoCadastro,
  validarRetorno,
  vendaTotalmenteDevolvida,
  voltaEstoquePadrao,
} from "./retorno";
import { documentoParcial, podeVerCredito } from "./acesso";

const itensVenda = [
  { id: "i1", produtoId: "pA", quantidade: 2, jaDevolvido: 0 },
  { id: "i2", produtoId: "pB", quantidade: 1, jaDevolvido: 1 },
];

describe("retorno com motivo obrigatório", () => {
  it("sem motivo é bloqueado", () => {
    expect(() => validarRetorno({ motivo: undefined, itensVenda })).toThrow(RetornoInvalido);
    expect(() => validarRetorno({ motivo: "", itensVenda })).toThrow("Informe o motivo do retorno.");
  });

  it("motivo fora da lista é bloqueado", () => {
    expect(() => validarRetorno({ motivo: "QUALQUER", itensVenda })).toThrow("Motivo de retorno inválido.");
  });

  it("sem itens devolve o saldo de cada item", () => {
    const r = validarRetorno({ motivo: "DESISTENCIA", itensVenda });
    expect(r.itens).toEqual([{ item: itensVenda[0], quantidade: 2 }]);
  });

  it("não deixa devolver mais que o vendido menos o já devolvido", () => {
    expect(() =>
      validarRetorno({ motivo: "ERRO_BALCAO", itens: [{ itemVendaId: "i2", quantidade: 1 }], itensVenda }),
    ).toThrow(/disponível: 0/);
    expect(() =>
      validarRetorno({
        motivo: "ERRO_BALCAO",
        itens: [
          { itemVendaId: "i1", quantidade: 1 },
          { itemVendaId: "i1", quantidade: 1.5 },
        ],
        itensVenda,
      }),
    ).toThrow(/disponível: 2/);
  });

  it("item de outra venda é bloqueado", () => {
    expect(() =>
      validarRetorno({ motivo: "ERRO_BALCAO", itens: [{ itemVendaId: "x", quantidade: 1 }], itensVenda }),
    ).toThrow("Item não pertence a esta venda.");
  });

  it("erro de cadastro marca revisão; garantia não volta ao estoque vendável", () => {
    expect(marcaRevisaoCadastro("ERRO_CADASTRO")).toBe(true);
    expect(marcaRevisaoCadastro("ERRO_BALCAO")).toBe(false);
    expect(voltaEstoquePadrao("GARANTIA_DEFEITO")).toBe(false);
    expect(voltaEstoquePadrao("DESISTENCIA")).toBe(true);
  });

  it("venda fica devolvida só quando tudo voltou", () => {
    expect(vendaTotalmenteDevolvida(itensVenda, new Map([["i1", 1]]))).toBe(false);
    expect(vendaTotalmenteDevolvida(itensVenda, new Map([["i1", 2]]))).toBe(true);
  });
});

describe("LGPD: quem vê crédito do cliente", () => {
  it("FINANCEIRO ou acima vê; vendedor só se for responsável", () => {
    expect(podeVerCredito({ id: "u1", perfil: "FINANCEIRO" }, { vendedorResponsavelId: null })).toBe(true);
    expect(podeVerCredito({ id: "u1", perfil: "ADMIN" }, { vendedorResponsavelId: "u2" })).toBe(true);
    expect(podeVerCredito({ id: "u1", perfil: "VENDEDOR" }, { vendedorResponsavelId: "u2" })).toBe(false);
    expect(podeVerCredito({ id: "u1", perfil: "VENDEDOR" }, { vendedorResponsavelId: "u1" })).toBe(true);
    expect(podeVerCredito({ id: "u1", perfil: "CAIXA" }, { vendedorResponsavelId: null })).toBe(false);
  });
  it("documento parcial não expõe o número completo", () => {
    expect(documentoParcial("12.345.678/0001-90")).toBe("**.345.678/0001-**");
    expect(documentoParcial("123.456.789-01")).toBe("***.456.789-**");
  });
});

import { protegerCliente } from "./acesso";

describe("LGPD: lista de clientes", () => {
  const cliente = {
    id: "c1",
    nome: "Oficina do Zé",
    cpfCnpj: "12345678000190",
    limiteCredito: "5000.00",
    saldoDevedor: "1200.00",
    scoreCredito: 0.8,
    senhaHashB2B: "pbkdf2$...",
    vendedorResponsavelId: "v1",
  };
  it("vendedor que não é responsável não recebe limite, saldo, score nem documento completo", () => {
    const r = protegerCliente({ id: "v2", perfil: "VENDEDOR" }, cliente) as Record<string, unknown>;
    expect(r.limiteCredito).toBeUndefined();
    expect(r.saldoDevedor).toBeUndefined();
    expect(r.scoreCredito).toBeUndefined();
    expect(r.senhaHashB2B).toBeUndefined();
    expect(r.cpfCnpj).toBe("**.345.678/0001-**");
    expect(r.podeVerCredito).toBe(false);
  });
  it("vendedor responsável e financeiro recebem o crédito; ninguém recebe o hash da senha", () => {
    const resp = protegerCliente({ id: "v1", perfil: "VENDEDOR" }, cliente) as Record<string, unknown>;
    expect(resp.limiteCredito).toBe("5000.00");
    expect(resp.cpfCnpj).toBe("12345678000190");
    expect(resp.senhaHashB2B).toBeUndefined();
    const fin = protegerCliente({ id: "f1", perfil: "FINANCEIRO" }, cliente) as Record<string, unknown>;
    expect(fin.saldoDevedor).toBe("1200.00");
    const caixa = protegerCliente({ id: "x", perfil: "CAIXA" }, cliente) as Record<string, unknown>;
    expect(caixa.limiteCredito).toBeUndefined();
  });
});
