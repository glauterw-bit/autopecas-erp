import { prisma } from "../db";
import { z } from "zod";
import { chamarEstruturado } from "./chamada";

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
Use somente ids da lista de candidatos. "confianca" vai de 0 a 1; "justificativa" é breve.`;

const TIPOS_CROSS = ["EQUIVALENTE", "SIMILAR", "SUBSTITUTO", "KIT_ALTERNATIVO", "NAO_COMPATIVEL"] as const;

export const crossSchema = z.object({
  resultados: z.array(
    z.object({
      id: z.string(),
      tipo: z.enum(TIPOS_CROSS),
      confianca: z.number(),
      justificativa: z.string(),
    }),
  ),
});

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
      SELECT p.id, p.sku, p.nome, p."codigoOem" AS "codigoOem", p."codigoFabricante" AS "codigoFabricante",
             m.nome AS marca
        FROM produtos p
        LEFT JOIN marcas m ON m.id = p."marcaId"
       WHERE p."empresaId" = ${empresaId}
         AND p.ativo = TRUE
         AND similarity(unaccent(lower(p.nome)), unaccent(lower(${alvo.nome}))) > 0.3
       ORDER BY similarity(unaccent(lower(p.nome)), unaccent(lower(${alvo.nome}))) DESC
       LIMIT 20`;
  } catch {
    const like = `%${alvo.nome.replace(/\s+/g, "%")}%`;
    candidatos = await prisma.$queryRaw<CandidatoCross[]>`
      SELECT p.id, p.sku, p.nome, p."codigoOem" AS "codigoOem", p."codigoFabricante" AS "codigoFabricante",
             m.nome AS marca
        FROM produtos p
        LEFT JOIN marcas m ON m.id = p."marcaId"
       WHERE p."empresaId" = ${empresaId} AND p.ativo = TRUE AND p.nome ILIKE ${like}
       LIMIT 20`;
  }

  if (candidatos.length === 0) return [];

  // 3. Re-ranking via IA (Structured Outputs). A IA só julga; quem grava é o humano.
  const parsed = await chamarEstruturado({
    empresaId,
    recurso: "cross-reference",
    papel: "default",
    maxTokens: 2048,
    schema: crossSchema,
    nomeSchema: "smartcross",
    mensagens: [
      { role: "system", content: SYSTEM_SMART_CROSS },
      {
        role: "user",
        content: `Peça-alvo:
${JSON.stringify(alvo, null, 2)}

Candidatos:
${JSON.stringify(candidatos, null, 2)}

Avalie cada candidato.`,
      },
    ],
  });

  const byId = new Map(candidatos.map((c) => [c.id, c]));
  return (
    parsed.resultados
      // id que não está entre os candidatos do tenant é descartado (a IA não cria peça).
      .filter((r) => r.tipo !== "NAO_COMPATIVEL" && byId.has(r.id))
      .map((r) => {
        const c = byId.get(r.id)!;
        return { ...r, confianca: Math.min(Math.max(r.confianca, 0), 1), sku: c.sku, nome: c.nome };
      })
      .sort((a, b) => b.confianca - a.confianca)
  );
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
