import { prisma } from "../db";
import { AI_MODELS, extrairJson, openai } from "./client";

// SmartCross
// ==========
// Encontra equivalentes / similares entre uma peça e o catálogo da loja.
// Estratégia híbrida:
//   1. Match exato em código_oem / código_fabricante / código_barras
//   2. Busca por aplicação veicular comum (mesma versão de veículo)
//   3. Re-ranking semântico via IA usando descrição/medidas

const SYSTEM_SMART_CROSS = `Você é especialista técnico em compatibilidade de auto peças.
Dado uma peça-alvo e candidatos, julgue quais são EQUIVALENTES (encaixe direto),
SIMILARES (encaixa com pequenas variações), SUBSTITUTOS (substituem uma linha
descontinuada) ou NAO_COMPATIVEIS.

Considere: dimensões, especificação técnica, sistema, posição, marca premium vs
genérica. NÃO marque como equivalente apenas porque o nome se parece.

Responda APENAS JSON: {"resultados":[{"id":"string","tipo":"EQUIVALENTE|SIMILAR|SUBSTITUTO|KIT_ALTERNATIVO|NAO_COMPATIVEL","confianca":0.0,"justificativa":"breve"}]}`;

export interface AlvoCross {
  nome: string;
  marca?: string | null;
  codigoOem?: string | null;
  codigoFabricante?: string | null;
  sistema?: string | null;
  aplicacaoVeicular?: string | null;
  dimensoes?: string | null;
}

export interface CandidatoCross {
  id: string;
  sku: string;
  nome: string;
  marca?: string | null;
  codigoOem?: string | null;
  codigoFabricante?: string | null;
}

export interface ResultadoCross {
  id: string;
  sku: string;
  nome: string;
  tipo: "EQUIVALENTE" | "SIMILAR" | "SUBSTITUTO" | "KIT_ALTERNATIVO" | "NAO_COMPATIVEL";
  confianca: number;
  justificativa: string;
}

export async function buscarEquivalentes(
  empresaId: string,
  alvo: AlvoCross,
): Promise<ResultadoCross[]> {
  // 1. Match exato por códigos
  const exatos = await prisma.produto.findMany({
    where: {
      empresaId,
      ativo: true,
      OR: [
        alvo.codigoOem ? { codigoOem: alvo.codigoOem } : {},
        alvo.codigoFabricante ? { codigoFabricante: alvo.codigoFabricante } : {},
      ].filter((c) => Object.keys(c).length > 0),
    },
    take: 10,
    include: { marca: true },
  });
  if (exatos.length > 0) {
    return exatos.map((p) => ({
      id: p.id,
      sku: p.sku,
      nome: p.nome,
      tipo: "EQUIVALENTE",
      confianca: 0.95,
      justificativa: "Match exato por código OEM/fabricante",
    }));
  }

  // 2. Candidatos por nome similar (pg_trgm) + mesma categoria
  let candidatos: CandidatoCross[] = [];
  try {
    candidatos = await prisma.$queryRaw<CandidatoCross[]>`
      SELECT p.id, p.sku, p.nome, p.codigo_oem AS "codigoOem", p.codigo_fabricante AS "codigoFabricante",
             m.nome AS marca
        FROM produtos p
        LEFT JOIN marcas m ON m.id = p.marca_id
       WHERE p.empresa_id = ${empresaId}
         AND p.ativo = TRUE
         AND similarity(unaccent(lower(p.nome)), unaccent(lower(${alvo.nome}))) > 0.3
       ORDER BY similarity(unaccent(lower(p.nome)), unaccent(lower(${alvo.nome}))) DESC
       LIMIT 20`;
  } catch {
    const like = `%${alvo.nome.replace(/\s+/g, "%")}%`;
    candidatos = await prisma.$queryRaw<CandidatoCross[]>`
      SELECT p.id, p.sku, p.nome, p.codigo_oem AS "codigoOem", p.codigo_fabricante AS "codigoFabricante",
             m.nome AS marca
        FROM produtos p
        LEFT JOIN marcas m ON m.id = p.marca_id
       WHERE p.empresa_id = ${empresaId} AND p.ativo = TRUE AND p.nome ILIKE ${like}
       LIMIT 20`;
  }

  if (candidatos.length === 0) return [];

  // 3. Re-ranking via IA
  const resp = await openai.chat.completions.create({
    model: AI_MODELS.default,
    max_completion_tokens: 1024,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_SMART_CROSS },
      {
        role: "user",
        content: `Peça-alvo:
${JSON.stringify(alvo, null, 2)}

Candidatos:
${JSON.stringify(candidatos, null, 2)}

Avalie cada candidato e devolva apenas o JSON.`,
      },
    ],
  });

  const txt = resp.choices[0]?.message?.content ?? "";
  const parsed = extrairJson<{ resultados: ResultadoCross[] }>(txt);
  const byId = new Map(candidatos.map((c) => [c.id, c]));
  return parsed.resultados
    .filter((r) => r.tipo !== "NAO_COMPATIVEL")
    .map((r) => {
      const c = byId.get(r.id);
      return { ...r, sku: c?.sku ?? "", nome: c?.nome ?? r.id };
    })
    .sort((a, b) => b.confianca - a.confianca);
}

// Persiste cross-references aprovados — chamado após confirmação manual
// ou quando confiança >= 0.9.
export async function salvarCrossReference(
  origemId: string,
  destinoId: string,
  tipo: "EQUIVALENTE" | "SIMILAR" | "SUBSTITUTO" | "KIT_ALTERNATIVO",
  confianca: number,
  fonte = "IA-SmartCross",
) {
  return prisma.crossReference.upsert({
    where: { origemId_destinoId: { origemId, destinoId } },
    update: { tipo, confianca, fonte },
    create: { origemId, destinoId, tipo, confianca, fonte },
  });
}
