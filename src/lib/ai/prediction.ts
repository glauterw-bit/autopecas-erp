import { prisma } from "../db";
import { z } from "zod";
import { chamarEstruturado } from "./chamada";
import { ErroIA } from "./uso";

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

// Quantidade vendida no período (só venda concluída: tipo VENDA, status PAGA/FATURADA).
async function vendidoNoPeriodo(empresaId: string, produtoId: string, dias: number) {
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);
  const r = await prisma.$queryRaw<Array<{ qtd: number | null }>>`
    SELECT SUM(iv.quantidade)::float AS qtd
      FROM itens_venda iv
      JOIN vendas v ON v.id = iv."vendaId"
     WHERE iv."produtoId" = ${produtoId}
       AND v."empresaId" = ${empresaId}
       AND v."criadaEm" >= ${desde}
       AND v.tipo = 'VENDA'
       AND v.status IN ('PAGA', 'FATURADA')`;
  return r[0]?.qtd ?? 0;
}

export async function preverProduto(
  empresaId: string,
  produtoId: string,
  opcoes: { comIA?: boolean } = {},
): Promise<PrevisaoDemanda> {
  const produto = await prisma.produto.findFirstOrThrow({
    where: { id: produtoId, empresaId },
    include: { estoques: true },
  });

  const estoqueAtual = produto.estoques.reduce(
    (acc, e) => acc + Number(e.quantidade) - Number(e.reservado),
    0,
  );

  // Média por dia corrido (antes era média só dos dias com venda, o que superestimava
  // a demanda de peça de giro baixo).
  const vendaMedia30d = (await vendidoNoPeriodo(empresaId, produtoId, 30)) / 30;
  const vendaMedia90d = (await vendidoNoPeriodo(empresaId, produtoId, 90)) / 90;
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

  // Números acima são determinísticos (banco). A IA só escreve a explicação.
  const explicacao = opcoes.comIA === false
    ? { fatores: [], texto: "" }
    : await explicarComIA(empresaId, {
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

Devolva "fatores" (lista curta) e "texto" (explicação de 1 a 2 frases).
Não proponha quantidades nem números novos: eles já foram calculados pelo sistema.`;

export const explicacaoSchema = z.object({
  fatores: z.array(z.string()),
  texto: z.string(),
});

async function explicarComIA(empresaId: string, ctx: {
  nome: string;
  estoqueAtual: number;
  vendaMedia30d: number;
  vendaMedia90d: number;
  diasCobertura: number;
  riscoRuptura: string;
}): Promise<{ fatores: string[]; texto: string }> {
  const mes = new Date().toLocaleString("pt-BR", { month: "long" });
  try {
    return await chamarEstruturado({
      empresaId,
      recurso: "previsao",
      papel: "fast",
      maxTokens: 512,
      schema: explicacaoSchema,
      nomeSchema: "explicacao_demanda",
      mensagens: [
        { role: "system", content: SYSTEM_PREV },
        {
          role: "user",
          content: `Mês atual: ${mes}. Produto: ${ctx.nome}.
Estoque: ${ctx.estoqueAtual}. Venda média 30d: ${ctx.vendaMedia30d.toFixed(2)} un/dia.
Cobertura: ${ctx.diasCobertura} dias. Risco: ${ctx.riscoRuptura}.`,
        },
      ],
    });
  } catch (e) {
    // Teto estourado ou IA desligada: a previsão segue sem o texto da IA.
    if (!(e instanceof ErroIA)) console.error("[ia/previsao] explicação falhou", (e as Error).message);
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
    // Primeiro o cálculo sem IA; só chama a IA para quem está em risco (antes eram
    // até 1.000 chamadas por loja por noite).
    const base = await preverProduto(empresaId, p.id, { comIA: false });
    if (base.riscoRuptura !== "ALTO" && base.riscoRuptura !== "IMINENTE") continue;
    const aberto = await prisma.insightIA.findFirst({
      where: {
        empresaId,
        tipo: "RUPTURA_PREDITIVA",
        resolvidoEm: null,
        dadosReferencia: { path: ["produtoId"], equals: p.id },
      },
      select: { id: true },
    });
    if (aberto) continue;
    const prev = await preverProduto(empresaId, p.id);
    {
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
