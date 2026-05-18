import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../db";
import { AI_MODELS, anthropic, cachedSystem } from "./client";

// CopilotoBalcão / OmniInbox
// ==========================
// Assistente conversacional usado em três frentes:
//   - Balcão: vendedor pergunta "qual pastilha de freio serve no Onix 2019?"
//   - WhatsApp: cliente final tira dúvidas e o bot responde com peças disponíveis
//   - OmniInbox: respostas sugeridas em todos os marketplaces
//
// Usa tool use para consultar o catálogo do tenant em tempo real.

const SYSTEM_CHAT = `Você é o assistente do AutoPeças ERP, especialista em peças automotivas brasileiras.
COMPORTAMENTO:
- Português brasileiro, tom direto e objetivo, sem jargão técnico desnecessário.
- Quando o cliente descrever um sintoma (ex.: "freio chiando", "carro morrendo"), sugira diagnóstico provável e peças associadas.
- Sempre que possível pergunte/confirme: modelo, ano, motorização — para garantir a aplicação correta.
- Use as ferramentas disponíveis para consultar o catálogo da loja. NUNCA invente preço ou estoque.
- Quando não encontrar a peça, ofereça registrar pedido sob encomenda.
- Em pedidos de orçamento, monte resposta com tabela curta: peça, marca, preço, garantia.`;

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "buscar_peca",
    description:
      "Busca peças no catálogo da loja por termo livre, código OEM, código de barras ou aplicação veicular.",
    input_schema: {
      type: "object",
      properties: {
        termo: { type: "string", description: "Termo de busca livre" },
        montadora: { type: "string" },
        modelo: { type: "string" },
        ano: { type: "integer" },
        sistema: { type: "string" },
        limite: { type: "integer", default: 8 },
      },
      required: ["termo"],
    },
  },
  {
    name: "verificar_disponibilidade",
    description: "Verifica o estoque atual e o preço de um produto pelo ID.",
    input_schema: {
      type: "object",
      properties: { produtoId: { type: "string" } },
      required: ["produtoId"],
    },
  },
  {
    name: "registrar_orcamento",
    description:
      "Cria um orçamento aberto com os itens listados para o cliente atual.",
    input_schema: {
      type: "object",
      properties: {
        clienteId: { type: "string" },
        itens: {
          type: "array",
          items: {
            type: "object",
            properties: {
              produtoId: { type: "string" },
              quantidade: { type: "number" },
            },
            required: ["produtoId", "quantidade"],
          },
        },
      },
      required: ["clienteId", "itens"],
    },
  },
];

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

function buildHandlers(empresaId: string): Record<string, ToolHandler> {
  return {
    buscar_peca: async (input) => {
      const termo = String(input.termo ?? "");
      const produtos = await prisma.produto.findMany({
        where: {
          empresaId,
          ativo: true,
          OR: [
            { nome: { contains: termo, mode: "insensitive" } },
            { codigoBarras: termo },
            { codigoOem: termo },
            { codigoFabricante: termo },
            { sku: termo },
          ],
        },
        take: Number(input.limite ?? 8),
        include: { marca: true, estoques: true },
      });
      return produtos.map((p) => ({
        id: p.id,
        sku: p.sku,
        nome: p.nome,
        marca: p.marca?.nome,
        precoVenda: Number(p.precoVenda),
        estoque: p.estoques.reduce(
          (a, e) => a + Number(e.quantidade) - Number(e.reservado),
          0,
        ),
      }));
    },
    verificar_disponibilidade: async (input) => {
      const p = await prisma.produto.findUnique({
        where: { id: String(input.produtoId) },
        include: { estoques: true, marca: true },
      });
      if (!p) return { encontrado: false };
      return {
        encontrado: true,
        nome: p.nome,
        marca: p.marca?.nome,
        precoVenda: Number(p.precoVenda),
        estoque: p.estoques.reduce(
          (a, e) => a + Number(e.quantidade) - Number(e.reservado),
          0,
        ),
        garantiaMeses: p.garantiaMeses,
      };
    },
    registrar_orcamento: async (input) => {
      const clienteId = String(input.clienteId);
      const itens = input.itens as Array<{ produtoId: string; quantidade: number }>;
      const venda = await prisma.venda.create({
        data: {
          empresaId,
          clienteId,
          tipo: "ORCAMENTO",
          numero: Math.floor(Date.now() / 1000),
          origem: "WHATSAPP",
          itens: {
            create: await Promise.all(
              itens.map(async (it) => {
                const prod = await prisma.produto.findUniqueOrThrow({
                  where: { id: it.produtoId },
                });
                const preco = Number(prod.precoVenda);
                const custo = Number(prod.custoMedio);
                return {
                  produtoId: it.produtoId,
                  quantidade: it.quantidade,
                  precoUnitario: preco,
                  custoUnitario: custo,
                  total: preco * it.quantidade,
                };
              }),
            ),
          },
        },
        select: { id: true, numero: true },
      });
      return { criado: true, vendaId: venda.id, numero: venda.numero };
    },
  };
}

export async function conversarChat(opts: {
  empresaId: string;
  conversaId?: string;
  mensagemUsuario: string;
  historico?: Anthropic.Messages.MessageParam[];
}) {
  const handlers = buildHandlers(opts.empresaId);
  const mensagens: Anthropic.Messages.MessageParam[] = [
    ...(opts.historico ?? []),
    { role: "user", content: opts.mensagemUsuario },
  ];

  // Loop de tool-use até o modelo retornar resposta final.
  for (let iter = 0; iter < 6; iter++) {
    const resp = await anthropic.messages.create({
      model: AI_MODELS.default,
      max_tokens: 1024,
      system: [cachedSystem(SYSTEM_CHAT)],
      tools: TOOLS,
      messages: mensagens,
    });

    if (resp.stop_reason !== "tool_use") {
      const textoFinal = resp.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      mensagens.push({ role: "assistant", content: resp.content });
      return { resposta: textoFinal, mensagens };
    }

    // Executa as ferramentas solicitadas.
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const block of resp.content) {
      if (block.type === "tool_use") {
        const handler = handlers[block.name];
        const output = handler
          ? await handler(block.input as Record<string, unknown>)
          : { erro: `Ferramenta desconhecida: ${block.name}` };
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(output),
        });
      }
    }
    mensagens.push({ role: "assistant", content: resp.content });
    mensagens.push({ role: "user", content: toolResults });
  }
  return { resposta: "Desculpe, não consegui concluir agora.", mensagens };
}
