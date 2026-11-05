import { describe, expect, it } from "vitest";
import { lerCsv, gerarCsv } from "./csv";
import { aplicarMapa, camposObrigatoriosFaltando, sugerirMapa } from "./mapa";
import { validar } from "./validar";
import { compararTotais, conferirOrigem } from "./conferencia";
import { Decimal, cnpjValido, cpfValido, gtinValido, lerData, lerNumero, paraCentavos } from "./normalizar";

describe("CSV e mapa de colunas", () => {
  it("lê CSV do Excel BR (;), com aspas, BOM e quebra de linha dentro do campo", () => {
    const csv = lerCsv('﻿Código;Descrição;Preço Venda\r\nT1;"PAST FREIO; DIANT\nSPRINTER";1.234,56\r\n\r\nT2;"DISCO ""ESPECIAL""";10,00\r\n');
    expect(csv.separador).toBe(";");
    expect(csv.cabecalhos).toEqual(["Código", "Descrição", "Preço Venda"]);
    expect(csv.linhas).toEqual([
      ["T1", "PAST FREIO; DIANT\nSPRINTER", "1.234,56"],
      ["T2", 'DISCO "ESPECIAL"', "10,00"],
    ]);
    expect(csv.numeroLinha).toEqual([2, 5]);
  });

  it("detecta vírgula como separador", () => {
    expect(lerCsv("a,b,c\n1,2,3").separador).toBe(",");
  });

  it("sugere o mapa pelos apelidos, sem usar a mesma coluna duas vezes", () => {
    const mapa = sugerirMapa("PRODUTO", ["Código", "Descrição", "Cód. Fabricante", "NCM", "Marca", "Preço de Venda R$", "Custo", "EAN"]);
    expect(mapa.codigo).toBe("Código");
    expect(mapa.descricao).toBe("Descrição");
    expect(mapa.codigoFabricante).toBe("Cód. Fabricante");
    expect(mapa.ncm).toBe("NCM");
    expect(mapa.precoVenda).toBe("Preço de Venda R$");
    expect(mapa.custo).toBe("Custo");
    expect(mapa.ean).toBe("EAN");
    expect(mapa.codigoOem).toBeNull();
    expect(camposObrigatoriosFaltando("PRODUTO", mapa)).toEqual([]);
    expect(camposObrigatoriosFaltando("PRODUTO", { ...mapa, descricao: null })).toEqual(["Descrição"]);
  });

  it("aplica o mapa e devolve o número da linha do arquivo", () => {
    const csv = lerCsv("cod;qtd\nA;5\nB;\n");
    const regs = aplicarMapa("ESTOQUE", csv, { codigo: "cod", quantidade: "qtd" });
    expect(regs).toEqual([
      { linha: 2, valores: { codigo: "A", quantidade: "5" } },
      { linha: 3, valores: { codigo: "B", quantidade: undefined } },
    ]);
  });

  it("gera CSV com BOM e escapa ;", () => {
    expect(gerarCsv([["a;b", 'x"y', 3]])).toBe('﻿"a;b";"x""y";3\r\n');
  });
});

describe("normalização", () => {
  it("números BR e com ponto; recusa o ambíguo", () => {
    expect(lerNumero("1.234,56")!.toString()).toBe("1234.56");
    expect(lerNumero("R$ 10,5")!.toString()).toBe("10.5");
    expect(lerNumero("12.75")!.toString()).toBe("12.75");
    expect(lerNumero("-3")!.toString()).toBe("-3");
    expect(() => lerNumero("1.234")).toThrow(/ambíguo/);
    expect(() => lerNumero("abc")).toThrow(/inválido/);
  });
  it("centavos com arredondamento de meio centavo para cima", () => {
    expect(paraCentavos(new Decimal("10.005"))).toBe(1001);
    expect(paraCentavos(new Decimal("0.1").add("0.2"))).toBe(30);
  });
  it("CPF, CNPJ, GTIN e datas", () => {
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("12345678900")).toBe(false);
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11222333000182")).toBe(false);
    expect(gtinValido("7891000315507")).toBe(true);
    expect(gtinValido("7891000315508")).toBe(false);
    expect(lerData("31/12/2026")!.toISOString()).toBe("2026-12-31T12:00:00.000Z");
    expect(lerData("2026-02-03")!.toISOString()).toBe("2026-02-03T12:00:00.000Z");
    expect(() => lerData("31/02/2026")).toThrow(/inexistente/);
  });
});

describe("validação linha a linha", () => {
  it("produto: erro por linha, avisos de NCM/EAN e repetido", () => {
    const r = validar("PRODUTO", [
      { linha: 2, valores: { codigo: "T1", descricao: "PAST FREIO DIANT SPRINTER 415 13/", ncm: "8708.30.90", ean: "7891000315507", precoVenda: "120,00", custo: "80,00" } },
      { linha: 3, valores: { codigo: "T2", descricao: "DISCO FREIO", ean: "123", precoVenda: "abc" } },
      { linha: 4, valores: { descricao: "SEM CODIGO" } },
      { linha: 5, valores: { codigo: "T1", descricao: "DUPLICADO" } },
    ]);
    expect(r[0].erros).toEqual([]);
    expect(r[0].dados!.ncm).toBe("87083090");
    expect(r[0].dados!.codigoBarras).toBe("7891000315507");
    expect(r[0].dados!.precoVenda!.toString()).toBe("120");
    expect(r[1].dados).toBeNull();
    expect(r[1].erros[0]).toMatch(/Preço de venda.*inválido/);
    expect(r[1].avisos.join()).toMatch(/Sem NCM/);
    expect(r[1].avisos.join()).toMatch(/EAN "123"/);
    expect(r[2].erros).toContain("Código interno vazio");
    expect(r[3].erros[0]).toMatch(/Repetido: mesma chave da linha 2/);
  });

  it("estoque negativo entra como zero com aviso", () => {
    const [r] = validar("ESTOQUE", [{ linha: 2, valores: { codigo: "T1", quantidade: "-2" } }]);
    expect(r.dados!.quantidade.toString()).toBe("0");
    expect(r.avisos[0]).toMatch(/negativo/);
  });

  it("cliente: CPF inválido vira aviso, CNPJ sem zero à esquerda é completado, sem chave é erro", () => {
    const r = validar("CLIENTE", [
      { linha: 2, valores: { codigo: "C1", nome: "CLIENTE TESTE", cpfCnpj: "123.456.789-00" } },
      { linha: 3, valores: { codigo: "C2", nome: "OFICINA TESTE", cpfCnpj: "1222333000128" } },
      { linha: 4, valores: { nome: "SEM CHAVE" } },
    ]);
    expect(r[0].dados!.cpfCnpj).toBeUndefined();
    expect(r[0].avisos[0]).toMatch(/inválido/);
    expect(r[0].avisos[0]).not.toContain("12345678900"); // LGPD: mensagem mascarada
    expect(r[1].dados!.cpfCnpj).toBe("01222333000128");
    expect(r[1].dados!.tipo).toBe("PJ");
    expect(r[2].dados).toBeNull();
  });

  it("conta a receber: forma de pagamento, saldo zero é erro, chave documento/parcela", () => {
    const r = validar("CONTA_RECEBER", [
      { linha: 2, valores: { documento: "NF123", parcela: "2", clienteCodigo: "C1", vencimento: "10/12/2026", valor: "150,10", formaPagamento: "Carteira" } },
      { linha: 3, valores: { documento: "NF124", clienteCodigo: "C1", vencimento: "10/12/2026", valor: "0,00", formaPagamento: "Boleto" } },
      { linha: 4, valores: { documento: "NF125", clienteCodigo: "C1", vencimento: "10/12/2026", valor: "10", formaPagamento: "Cartão Débito" } },
    ]);
    expect(r[0].chave).toBe("D:NF123/2");
    expect(r[0].dados!.formaPagamento).toBe("CREDIARIO");
    expect(r[0].dados!.totalParcelas).toBe(2);
    expect(r[1].erros[0]).toMatch(/sem saldo/);
    expect(r[2].dados!.formaPagamento).toBe("DEBITO");
  });
});

describe("relatório de conferência", () => {
  it("soma estoque e valor a custo em centavos, por depósito", () => {
    const regs = validar("ESTOQUE", [
      { linha: 2, valores: { codigo: "A", deposito: "Loja", quantidade: "3", custo: "10,333" } },
      { linha: 3, valores: { codigo: "B", deposito: "Loja", quantidade: "1,5", custo: "2,00" } },
      { linha: 4, valores: { codigo: "C", deposito: "Galpão", quantidade: "2" } }, // custo vem do cadastro
      { linha: 5, valores: { codigo: "D", quantidade: "x" } }, // erro
    ]);
    const c = conferirOrigem("ESTOQUE", regs, { custoPorSku: new Map([["C", new Decimal("7.50")]]) });
    expect(c.linhasLidas).toBe(4);
    expect(c.validas).toBe(3);
    expect(c.comErro).toBe(1);
    expect(c.totais.quantidade).toBe("6.500");
    // 3 × 10,333 = 30,999 + 1,5 × 2 = 3 + 2 × 7,50 = 15 → 48,999 → R$ 49,00
    expect(c.totais.valorCustoCentavos).toBe(4900);
    expect(c.porDeposito).toEqual([
      { deposito: "Galpão", itens: 1, quantidade: "2.000", valorCustoCentavos: 1500 },
      { deposito: "Loja", itens: 2, quantidade: "4.500", valorCustoCentavos: 3400 },
    ]);
  });

  it("soma contas em aberto em centavos e aponta diferença com o gravado", () => {
    const regs = validar("CONTA_RECEBER", [
      { linha: 2, valores: { codigo: "1", clienteCodigo: "C1", vencimento: "01/01/2020", valor: "100,10" } },
      { linha: 3, valores: { codigo: "2", clienteCodigo: "C2", vencimento: "01/01/2099", valor: "0,20" } },
    ]);
    const c = conferirOrigem("CONTA_RECEBER", regs);
    expect(c.totais.valorAbertoCentavos).toBe(10030);
    expect(c.detalhes.titulosVencidos).toBe(1);
    expect(c.detalhes.clientesDistintos).toBe(2);
    expect(compararTotais(c.totais, { registros: 2, valorAbertoCentavos: 10030 })).toEqual([]);
    expect(compararTotais(c.totais, { registros: 1, valorAbertoCentavos: 10010 })).toEqual([
      "Registros: origem 2, gravados 1",
      "Contas em aberto: origem R$ 100,30, gravado R$ 100,10",
    ]);
  });
});
