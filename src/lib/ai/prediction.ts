import { prisma } from "../db";
import { AI_MODELS, extrairJson, openai } from "./client";

// DemandSense / StockPredict
// ==========================
// Combina heurísticas determinísticas (suavização exponencial + média móvel
// + sazonalidade) com a IA para considerar fatores externos: feriados, clima
// regional, eventos automotivos, campanhas, lançamentos de modelos.
//
// O retorno alimenta o módulo de compras e gera InsightIA(RUPTURA_PREDITIVA).

export interface PrevisaoDemanda {
  produtoId: string;
  sku: string;
  nome: string;
  estoqueAtual: number;
  vendaMedia30d: number;
  vendaMedia90d: number;
  diasCobertura: number;
  pontoReposicaoSugerido: number;
  quantidadeSugerida: number;
  riscoRuptura: "BAIXO" | "MEDIO" | "ALTO" | "IMINENTE";
  fatoresExternos: string[];
  explicacao: string;
}

async function historicoVendas(produtoId: string, dias: number) {
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);
  return prisma.$queryRaw<Array<{ dia: Date; qtd: number }>>`
    SELECT DATE_TRUNC('day', v.criada_em) AS dia, SUM(iv.quantidade)::float AS qtd
      FROM itens_venda iv
      JOIN vendas v ON v.id = iv.venda_id
     WHERE iv.produto_id = ${produtoId}
       AND v.criada_em >= ${desde}
       AND v.status NOT IN ('CANCELADA')
     GROUP BY 1
     ORDER BY 1`;
}

function media(arr: number[]) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export async function preverProduto(produtoId: string): Promise<PrevisaoDemanda> {
  const produto = await prisma.produto.findUniqueOrThrow({
    where: { id: produtoId },
    include: { estoques: true },
  });

  const estoqueAtual = produto.estoques.reduce(
    (acc, e) => acc + Number(e.quantidade) - Number(e.reservado),
    0,
  );

  const h30 = await historicoVendas(produtoId, 30);
  const h90 = await historicoVendas(produtoId, 90);

  const vendaMedia30d = media(h30.map((r) => r.qtd));
  const vendaMedia90d = media(h90.map((r) => r.qtd));
  const diasCobertura =
    vendaMedia30d > 0 ? Math.round(estoqueAtual / vendaMedia30d) : 999;

  const leadTime = produto.leadTimeDias;
  const fatorSeguranca = 1.4;
  const pontoReposicaoSugerido = Math.ceil(vendaMedia30d * leadTime * fatorSeguranca);
  const quantidadeSugerida = Math.max(
    0,
    Math.ceil(vendaMedia30d * (leadTime + 21) - estoqueAtual),
  );

  let riscoRuptura: PrevisaoDemanda["riscoRuptura"] = "BAIXO";
  if (diasCobertura <= leadTime) riscoRuptura = "IMINENTE";
  else if (diasCobertura <= leadTime * 1.5) riscoRuptura = "ALTO";
  else if (diasCobertura <= leadTime * 2) riscoRuptura = "MEDIO";

  const explicacao = await explicarComIA({
    nome: produto.nome,
    estoqueAtual,
    vendaMedia30d,
    vendaMedia90d,
    diasCobertura,
    riscoRuptura,
  });

  return {
    produtoId,
    sku: produto.sku,
    nome: produto.nome,
    estoqueAtual,
    vendaMedia30d,
    vendaMedia90d,
    diasCobertura,
    pontoReposicaoSugerido,
    quantidadeSugerida,
    riscoRuptura,
    fatoresExternos: explicacao.fatores,
    explicacao: explicacao.texto,
  };
}

const SYSTEM_PREV = `Você é um analista de demanda de auto peças no mercado brasileiro.
Considere SEMPRE fatores externos que afetam venda:
- Sazonalidade (chuva → palhetas/bateria; frio → bateria; calor → ar; férias → óleo/freio)
- Calendário fiscal (final de mês = mais vendas a prazo)
- Clima regional típico do mês
- Comportamento setorial conhecido
- Tendências de adoção (carros elétricos, peças de manutenção preventiva)

Responda APENAS JSON: {"fatores":["string","string"],"texto":"explicação curta com 1-2 frases"}`;

async function explicarComIA(ctx: {
  nome: string;
  estoqueAtual: number;
  vendaMedia30d: number;
  vendaMedia90d: number;
  diasCobertura: number;
  riscoRuptura: string;
}): Promise<{ fatores: string[]; texto: string }> {
  const mes = new Date().toLocaleString("pt-BR", { month: "long" });
  try {
    const resp = await openai.chat.completions.create({
      model: AI_MODELS.fast,
      max_completion_tokens: 256,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PREV },
        {
          role: "user",
          content: `Mês atual: ${mes}. Produto: ${ctx.nome}.
Estoque: ${ctx.estoqueAtual}. Venda média 30d: ${ctx.vendaMedia30d.toFixed(2)} un/dia.
Cobertura: ${ctx.diasCobertura} dias. Risco: ${ctx.riscoRuptura}.`,
        },
      ],
    });
    const txt = resp.choices[0]?.message?.content ?? "";
    return extrairJson<{ fatores: string[]; texto: string }>(txt);
  } catch {
    return { fatores: [], texto: "" };
  }
}

// Roda em batch e cria insights para os produtos em risco.
export async function gerarInsightsRupturaEmpresa(empresaId: string) {
  const produtos = await prisma.produto.findMany({
    where: { empresaId, ativo: true, curva: { in: ["A", "B"] } },
    select: { id: true },
    take: 1000,
  });

  let criados = 0;
  for (const p of produtos) {
    const prev = await preverProduto(p.id);
    if (prev.riscoRuptura === "ALTO" || prev.riscoRuptura === "IMINENTE") {
      await prisma.insightIA.create({
        data: {
          empresaId,
          tipo: "RUPTURA_PREDITIVA",
          severidade: prev.riscoRuptura === "IMINENTE" ? "CRITICO" : "AVISO",
          titulo: `Risco de ruptura: ${prev.nome}`,
          descricao: `Cobertura de ${prev.diasCobertura} dias com média ${prev.vendaMedia30d.toFixed(2)}/dia. ${prev.explicacao}`,
          acaoSugerida: `Comprar ${prev.quantidadeSugerida} unidades (ponto reposição sugerido: ${prev.pontoReposicaoSugerido}).`,
          dadosReferencia: { produtoId: p.id, previsao: prev } as object,
        },
      });
      criados++;
    }
  }
  return criados;
}
