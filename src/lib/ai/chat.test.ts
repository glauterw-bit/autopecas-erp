import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// Banco falso em memória com DUAS empresas, para provar o isolamento.
const db = vi.hoisted(() => ({
  produtos: [] as Array<Record<string, unknown>>,
  clientes: [] as Array<Record<string, unknown>>,
  vendas: [] as Array<Record<string, unknown>>,
}));

function casa(row: Record<string, unknown>, where: Record<string, unknown>) {
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return true;
    if (v && typeof v === "object" && "in" in (v as object)) return (v as { in: unknown[] }).in.includes(row[k]);
    return row[k] === v;
  });
}

vi.mock("../db", () => ({
  prisma: {
    produto: {
      findMany: vi.fn(async ({ where }) => db.produtos.filter((p) => casa(p, where))),
      findFirst: vi.fn(async ({ where }) => db.produtos.find((p) => casa(p, where)) ?? null),
    },
    cliente: {
      findFirst: vi.fn(async ({ where }) => db.clientes.find((c) => casa(c, where)) ?? null),
    },
    venda: {
      findFirst: vi.fn(async ({ where }) => {
        const doTenant = db.vendas.filter((v) => v.empresaId === where.empresaId);
        return doTenant.sort((a, b) => (b.numero as number) - (a.numero as number))[0] ?? null;
      }),
      create: vi.fn(async ({ data }) => {
        const v = { id: `v${db.vendas.length + 1}`, ...data };
        db.vendas.push(v);
        return { id: v.id, numero: v.numero };
      }),
    },
  },
}));

const chamarIA = vi.hoisted(() => vi.fn());
vi.mock("./chamada", () => ({ chamarIA }));

import { buildHandlers, conversarChat, mascararPrecosNaoConfirmados, precosNoTexto } from "./chat";

const dec = (v: string) => new Prisma.Decimal(v);

beforeEach(() => {
  vi.clearAllMocks();
  db.produtos.length = 0;
  db.clientes.length = 0;
  db.vendas.length = 0;
  db.produtos.push(
    {
      id: "pA", empresaId: "A", ativo: true, sku: "A1", nome: "Pastilha Ducato", marca: { nome: "Cobreq" },
      precoVenda: dec("89.9000"), custoMedio: dec("50.1234"), garantiaMeses: 3,
      estoques: [{ quantidade: dec("5.000"), reservado: dec("1.000") }],
    },
    {
      id: "pB", empresaId: "B", ativo: true, sku: "B1", nome: "Pastilha Ducato", marca: { nome: "Outra" },
      precoVenda: dec("10.0000"), custoMedio: dec("5.0000"), garantiaMeses: 0,
      estoques: [{ quantidade: dec("99.000"), reservado: dec("0") }],
    },
  );
  db.clientes.push({ id: "cA", empresaId: "A" }, { id: "cB", empresaId: "B" });
  db.vendas.push({ id: "vA0", empresaId: "A", numero: 41 }, { id: "vB0", empresaId: "B", numero: 900 });
});

describe("isolamento entre empresas nas ferramentas do chat", () => {
  it("buscar_peca só devolve produto (preço e estoque) da própria empresa", async () => {
    const h = buildHandlers("A", new Set());
    const r = (await h.buscar_peca({ termo: "pastilha" })) as Array<Record<string, unknown>>;
    expect(r.map((p) => p.id)).toEqual(["pA"]);
    expect(r[0]).toMatchObject({ precoCentavos: 8990, preco: "R$ 89,90", estoque: 4 });
  });

  it("verificar_disponibilidade não enxerga produto de outra empresa", async () => {
    const h = buildHandlers("A", new Set());
    expect(await h.verificar_disponibilidade({ produtoId: "pB" })).toEqual({ encontrado: false });
  });

  it("registrar_orcamento recusa cliente de outra empresa e não grava nada", async () => {
    const h = buildHandlers("A", new Set());
    const r = await h.registrar_orcamento({ clienteId: "cB", itens: [{ produtoId: "pA", quantidade: 1 }] });
    expect(r).toMatchObject({ criado: false });
    expect(db.vendas).toHaveLength(2);
  });

  it("registrar_orcamento recusa produto de outra empresa", async () => {
    const h = buildHandlers("A", new Set());
    const r = await h.registrar_orcamento({ clienteId: "cA", itens: [{ produtoId: "pB", quantidade: 1 }] });
    expect(r).toMatchObject({ criado: false });
    expect(db.vendas).toHaveLength(2);
  });

  it("no WhatsApp o cliente do orçamento é o do número, não o que o modelo mandar", async () => {
    const h = buildHandlers("A", new Set(), { canal: "WHATSAPP", clienteIdDoCanal: null });
    const r = await h.registrar_orcamento({ clienteId: "cA", itens: [{ produtoId: "pA", quantidade: 1 }] });
    expect(r).toMatchObject({ criado: false });
  });

  it("orçamento válido: total em centavos, número sequencial da empresa", async () => {
    const permitidos = new Set<number>();
    const h = buildHandlers("A", permitidos);
    const r = (await h.registrar_orcamento({
      clienteId: "cA",
      itens: [{ produtoId: "pA", quantidade: 3 }],
    })) as Record<string, unknown>;
    expect(r).toMatchObject({ criado: true, numero: 42, totalCentavos: 26970, total: "R$ 269,70" });
    const v = db.vendas.at(-1)!;
    expect(String(v.valorTotal)).toBe("269.7");
    expect(v.origem).toBe("BALCAO");
    expect(permitidos.has(26970)).toBe(true);
  });
});

describe("guarda contra preço inventado", () => {
  it("lê preços em reais do texto", () => {
    expect(precosNoTexto("de R$ 1.234,56 por R$89,9 ou R$ 90").map((p) => p.centavos)).toEqual([
      123456, 8990, 9000,
    ]);
  });
  it("mascara preço que não veio de ferramenta e mantém o que veio", () => {
    const r = mascararPrecosNaoConfirmados("Pastilha R$ 89,90; a Bosch sai R$ 75,00.", new Set([8990]));
    expect(r.mascarados).toBe(1);
    expect(r.texto).toBe("Pastilha R$ 89,90; a Bosch sai [preço a confirmar no balcão].");
  });
  it("conversa completa: preço do banco passa, preço inventado é mascarado", async () => {
    chamarIA
      .mockResolvedValueOnce({
        choices: [{ message: { role: "assistant", content: null, tool_calls: [
          { id: "t1", type: "function", function: { name: "buscar_peca", arguments: '{"termo":"pastilha"}' } },
        ] } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: "assistant", content: "Temos por R$ 89,90. Na concorrente custa R$ 70,00." } }],
      });
    const r = await conversarChat({ empresaId: "A", mensagemUsuario: "pastilha ducato?" });
    expect(r.resposta).toBe("Temos por R$ 89,90. Na concorrente custa [preço a confirmar no balcão].");
    expect(r.precosMascarados).toBe(1);
    expect(chamarIA.mock.calls[0][0]).toMatchObject({ empresaId: "A", papel: "tools", recurso: "chat" });
  });
});
