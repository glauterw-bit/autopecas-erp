import { describe, it, expect } from "vitest";
import { agruparVendasPerdidas, type RegistroPerda } from "./vendas-perdidas";

const r = (p: Partial<RegistroPerda>): RegistroPerda => ({
  produtoId: null,
  descricaoBuscada: "x",
  quantidade: 1,
  motivo: "SEM_ESTOQUE",
  criadoEm: new Date("2026-11-01"),
  ...p,
});

describe("relatório de vendas perdidas", () => {
  it("produto vinculado sem estoque → sugere comprar perdido + mínimo − saldo", () => {
    const produtos = new Map([["pA", { nome: "Pastilha diant. Sprinter 415", sku: "PST-1", estoque: 0, estoqueMinimo: 2 }]]);
    const g = agruparVendasPerdidas(
      [r({ produtoId: "pA", quantidade: 2 }), r({ produtoId: "pA", quantidade: 1, motivo: "PRAZO_ENTREGA" })],
      produtos,
    );
    expect(g).toHaveLength(1);
    expect(g[0].ocorrencias).toBe(2);
    expect(g[0].comprarQtd).toBe(5);
    expect(g[0].sugestao).toContain("Comprar 5 un");
  });

  it("texto livre agrupa ignorando acento, caixa e espaços; 3 pedidos 'não trabalhamos' → avaliar mix", () => {
    const g = agruparVendasPerdidas([
      r({ descricaoBuscada: "Filtro combustível Master 2.3", motivo: "NAO_TRABALHAMOS" }),
      r({ descricaoBuscada: "FILTRO COMBUSTIVEL  master 2.3", motivo: "NAO_TRABALHAMOS" }),
      r({ descricaoBuscada: "filtro combustivel master 2.3 ", motivo: "NAO_TRABALHAMOS" }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].sugestao).toMatch(/pedido 3 vezes/);
  });

  it("preço como motivo principal → rever preço", () => {
    const produtos = new Map([["pB", { nome: "Kit embreagem Ducato", sku: "KIT-1", estoque: 3, estoqueMinimo: 1 }]]);
    const g = agruparVendasPerdidas([r({ produtoId: "pB", motivo: "PRECO" })], produtos);
    expect(g[0].sugestao).toBe("Rever preço (cliente achou caro)");
    expect(g[0].comprarQtd).toBe(0);
  });
});
