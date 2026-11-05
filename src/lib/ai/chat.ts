import type OpenAI from "openai";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { chamarIA } from "./chamada";
import {
  centavosParaDecimal,
  dec,
  formatarCentavos,
  paraCentavos,
  totalItemCentavos,
} from "./dinheiro";

// CopilotoBalcão / OmniInbox
// ==========================
// Assistente conversacional usado em três frentes:
//   - Balcão: vendedor pergunta "qual pastilha de freio serve no Onix 2019?"
//   - WhatsApp: cliente final tira dúvidas e o bot responde com peças disponíveis
//   - OmniInbox: respostas sugeridas em todos os marketplaces
//
// Usa function calling para consultar o catálogo do tenant em tempo real.
// Guardas contra invenção:
//   - preço e estoque só saem das ferramentas (banco do tenant), em centavos;
//   - na resposta final, todo "R$ x" que não veio de uma ferramenta é mascarado.

const SYSTEM_CHAT = `Você é o assistente do AutoPeças ERP, especialista em peças automotivas brasileiras.
COMPORTAMENTO:
- Português brasileiro, tom direto e objetivo, sem jargão técnico desnecessário.
- Quando o cliente descrever um sintoma (ex.: "freio chiando", "carro morrendo"), sugira diagnóstico provável e peças associadas.
- Sempre que possível pergunte/confirme: modelo, ano, motorização — para garantir a aplicação correta.
- Use as ferramentas disponíveis para consultar o catálogo da loja. NUNCA invente preço ou estoque.
- Preço: copie exatamente o campo "preco" devolvido pela ferramenta (ex.: "R$ 89,90"). Não faça contas de preço; o total do orçamento vem da ferramenta registrar_orcamento.
- Quando não encontrar a peça, ofereça registrar pedido sob encomenda.
- Em pedidos de orçamento, monte resposta com tabela curta: peça, marca, preço, garantia.`;

const MASCARA_PRECO = "[preço a confirmar no balcão]";
const LIMITE_ITENS_ORCAMENTO = 30;
const LIMITE_QTD_ITEM = 1000;
const RE_PRECO = /R\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/g;

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "buscar_peca",
      description:
        "Busca peças no catálogo da loja por termo livre, código OEM, código de barras ou aplicação veicular.",
      parameters: {
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
  },
  {
    type: "function",
    function: {
      name: "verificar_disponibilidade",
      description: "Verifica o estoque atual e o preço de um produto pelo ID.",
      parameters: {
        type: "object",
        properties: { produtoId: { type: "string" } },
        required: ["produtoId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_orcamento",
      description: "Cria um orçamento aberto com os itens listados para o cliente atual.",
      parameters: {
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
  },
];

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

function estoqueDisponivel(estoques: Array<{ quantidade: Prisma.Decimal; reservado: Prisma.Decimal }>) {
  return estoques
    .reduce((a, e) => a.add(dec(e.quantidade)).sub(dec(e.reservado)), new Prisma.Decimal(0))
    .toNumber();
}

/** Preço vindo do banco → centavos + texto pronto para o cliente. */
export function precoParaFerramenta(precoVenda: Prisma.Decimal | string | number) {
  const precoCentavos = paraCentavos(precoVenda);
  return { precoCentavos, preco: formatarCentavos(precoCentavos) };
}

function centavosDoTrecho(m: RegExpMatchArray): number {
  const reais = Number(m[1].replace(/\./g, ""));
  const cent = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  return reais * 100 + cent;
}

/** Lê "R$ 1.234,56" / "R$ 89,90" / "R$ 90" e devolve os valores em centavos. */
export function precosNoTexto(texto: string) {
  return [...texto.matchAll(RE_PRECO)].map((m) => ({ trecho: m[0], centavos: centavosDoTrecho(m) }));
}

/**
 * Mascara todo preço da resposta que não veio das ferramentas.
 * Conservador: soma feita pelo modelo também é mascarada (o total válido vem de registrar_orcamento).
 */
export function mascararPrecosNaoConfirmados(texto: string, permitidos: Set<number>) {
  let mascarados = 0;
  const saida = texto.replace(RE_PRECO, (...args) => {
    const m = args as unknown as RegExpMatchArray;
    if (permitidos.has(centavosDoTrecho(m))) return m[0];
    mascarados++;
    return MASCARA_PRECO;
  });
  return { texto: saida, mascarados };
}

export interface ContextoChat {
  /** WHATSAPP: quem fala é o cliente final; o cliente do orçamento é o do número, nunca o que o modelo mandar. */
  canal: "BALCAO" | "WHATSAPP";
  clienteIdDoCanal?: string | null;
}

export function buildHandlers(
  empresaId: string,
  precosPermitidos: Set<number>,
  contexto: ContextoChat = { canal: "BALCAO" },
): Record<string, ToolHandler> {
  return {
    buscar_peca: async (input) => {
      const termo = String(input.termo ?? "").trim().slice(0, 120);
      if (!termo) return [];
      const limite = Math.min(Math.max(Math.trunc(Number(input.limite ?? 8)) || 8, 1), 20);
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
        take: limite,
        include: { marca: true, estoques: true },
      });
      return produtos.map((p) => {
        const preco = precoParaFerramenta(p.precoVenda);
        precosPermitidos.add(preco.precoCentavos);
        return {
          id: p.id,
          sku: p.sku,
          nome: p.nome,
          marca: p.marca?.nome,
          ...preco,
          estoque: estoqueDisponivel(p.estoques),
        };
      });
    },
    verificar_disponibilidade: async (input) => {
      const p = await prisma.produto.findFirst({
        where: { id: String(input.produtoId ?? ""), empresaId, ativo: true },
        include: { estoques: true, marca: true },
      });
      if (!p) return { encontrado: false };
      const preco = precoParaFerramenta(p.precoVenda);
      precosPermitidos.add(preco.precoCentavos);
      return {
        encontrado: true,
        nome: p.nome,
        marca: p.marca?.nome,
        ...preco,
        estoque: estoqueDisponivel(p.estoques),
        garantiaMeses: p.garantiaMeses,
      };
    },
    registrar_orcamento: async (input) => {
      const clienteId =
        contexto.canal === "WHATSAPP" ? (contexto.clienteIdDoCanal ?? "") : String(input.clienteId ?? "");
      if (!clienteId) {
        return { criado: false, erro: "Cliente não identificado; um atendente vai registrar o orçamento." };
      }
      const brutos = Array.isArray(input.itens) ? (input.itens as Array<Record<string, unknown>>) : [];
      if (brutos.length === 0 || brutos.length > LIMITE_ITENS_ORCAMENTO) {
        return { criado: false, erro: `Informe de 1 a ${LIMITE_ITENS_ORCAMENTO} itens.` };
      }
      const itens = brutos.map((it) => ({
        produtoId: String(it.produtoId ?? ""),
        quantidade: Number(it.quantidade),
      }));
      if (itens.some((it) => !(it.quantidade > 0 && it.quantidade <= LIMITE_QTD_ITEM))) {
        return { criado: false, erro: "Quantidade inválida." };
      }
      // Cliente e produtos sempre do próprio tenant (o id vem do modelo, não é confiável).
      const cliente = await prisma.cliente.findFirst({
        where: { id: clienteId, empresaId },
        select: { id: true },
      });
      if (!cliente) return { criado: false, erro: "Cliente não encontrado nesta loja." };
      const ids = [...new Set(itens.map((i) => i.produtoId))];
      const produtos = await prisma.produto.findMany({
        where: { id: { in: ids }, empresaId, ativo: true },
        select: { id: true, nome: true, precoVenda: true, custoMedio: true },
      });
      const porId = new Map(produtos.map((p) => [p.id, p]));
      if (ids.some((id) => !porId.has(id))) {
        return { criado: false, erro: "Produto não encontrado nesta loja." };
      }

      const linhas = itens.map((it) => {
        const p = porId.get(it.produtoId)!;
        return {
          it,
          p,
          totalCentavos: totalItemCentavos(p.precoVenda, String(it.quantidade)),
          custoCentavos: totalItemCentavos(p.custoMedio, String(it.quantidade)),
        };
      });
      const totalCentavos = linhas.reduce((a, l) => a + l.totalCentavos, 0);
      const custoCentavos = linhas.reduce((a, l) => a + l.custoCentavos, 0);

      const venda = await criarOrcamentoComNumero(empresaId, (numero) => ({
        empresaId,
        clienteId: cliente.id,
        tipo: "ORCAMENTO",
        status: "ABERTA",
        numero,
        origem: contexto.canal,
        valorBruto: centavosParaDecimal(totalCentavos),
        valorTotal: centavosParaDecimal(totalCentavos),
        custoTotal: centavosParaDecimal(custoCentavos),
        itens: {
          create: linhas.map((l) => ({
            produtoId: l.p.id,
            quantidade: new Prisma.Decimal(String(l.it.quantidade)),
            precoUnitario: l.p.precoVenda,
            custoUnitario: l.p.custoMedio,
            total: centavosParaDecimal(l.totalCentavos),
          })),
        },
      }));

      for (const l of linhas) {
        precosPermitidos.add(paraCentavos(l.p.precoVenda));
        precosPermitidos.add(l.totalCentavos);
      }
      precosPermitidos.add(totalCentavos);
      return {
        criado: true,
        vendaId: venda.id,
        numero: venda.numero,
        itens: linhas.map((l) => ({
          nome: l.p.nome,
          quantidade: l.it.quantidade,
          ...precoParaFerramenta(l.p.precoVenda),
          total: formatarCentavos(l.totalCentavos),
        })),
        totalCentavos,
        total: formatarCentavos(totalCentavos),
      };
    },
  };
}

// Número sequencial por empresa (o mesmo critério de /api/vendas), com nova
// tentativa se outro processo pegar o mesmo número (unique empresaId+numero).
// Antes usava Date.now()/1000, o que fazia a numeração de vendas saltar para ~1,7 bilhão.
async function criarOrcamentoComNumero(
  empresaId: string,
  dados: (numero: number) => Prisma.VendaUncheckedCreateInput,
) {
  for (let tentativa = 0; ; tentativa++) {
    const ultima = await prisma.venda.findFirst({
      where: { empresaId },
      orderBy: { numero: "desc" },
      select: { numero: true },
    });
    try {
      return await prisma.venda.create({
        data: dados((ultima?.numero ?? 0) + 1),
        select: { id: true, numero: true },
      });
    } catch (e) {
      const conflito =
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002" &&
        JSON.stringify(e.meta?.target ?? "").includes("numero");
      if (!conflito || tentativa >= 2) throw e;
    }
  }
}

export async function conversarChat(opts: {
  empresaId: string;
  conversaId?: string;
  mensagemUsuario: string;
  historico?: OpenAI.Chat.ChatCompletionMessageParam[];
  contexto?: ContextoChat;
}) {
  const precosPermitidos = new Set<number>();
  const handlers = buildHandlers(opts.empresaId, precosPermitidos, opts.contexto);
  const mensagens: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_CHAT },
    ...(opts.historico ?? []),
    { role: "user", content: opts.mensagemUsuario },
  ];

  // Loop de tool-use até o modelo retornar resposta final.
  for (let iter = 0; iter < 6; iter++) {
    const resp = await chamarIA({
      empresaId: opts.empresaId,
      recurso: "chat",
      papel: "tools",
      maxTokens: 1024,
      tools: TOOLS,
      mensagens,
    });

    const msg = resp.choices[0]?.message;
    if (!msg) break;

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      mensagens.push(msg);
      const guarda = mascararPrecosNaoConfirmados(msg.content ?? "", precosPermitidos);
      if (guarda.mascarados > 0) {
        console.warn("[ia/chat] preço sem origem no banco foi mascarado", {
          empresaId: opts.empresaId,
          quantidade: guarda.mascarados,
        });
      }
      return { resposta: guarda.texto, precosMascarados: guarda.mascarados, mensagens };
    }

    // Adiciona a chamada do assistente antes dos resultados.
    mensagens.push(msg);
    for (const call of msg.tool_calls) {
      if (call.type !== "function") continue;
      const handler = handlers[call.function.name];
      let output: unknown;
      try {
        const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
        output = handler
          ? await handler(args)
          : { erro: `Ferramenta desconhecida: ${call.function.name}` };
      } catch (e) {
        console.error("[ia/chat] erro na ferramenta", call.function.name, (e as Error).message);
        output = { erro: "Não foi possível consultar agora." };
      }
      mensagens.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(output),
      });
    }
  }
  return { resposta: "Desculpe, não consegui concluir agora.", precosMascarados: 0, mensagens };
}
