import { z } from "zod";
import { chamarEstruturado } from "./chamada";

// AutoVision AI
// =============
// Usuário fotografa a peça e a IA identifica:
//   - categoria / sistema veicular
//   - sinais de marca, número de série, código OEM impressos
//   - estado/desgaste aparente
//   - sugestão de termos de busca para localizar no catálogo
//
// Em seguida casamos o resultado com SmartCross para encontrar SKU equivalente.
// Saída por Structured Outputs (json_schema strict) validada com Zod.

const SYSTEM_PROMPT_VISION = `Você é um especialista em identificação de auto peças com 30 anos de bancada.
Sua tarefa é analisar a foto de uma peça automotiva e retornar uma identificação estruturada.

REGRAS:
- Se a peça estiver muito desgastada ou ilegível, indique isso em "observacoes" e baixe a confianca.
- Tente ler códigos impressos: OEM, fabricante (Bosch, NGK, Mahle, Cofap, etc.) e número de série.
- Identifique o sistema (FREIO, MOTOR, SUSPENSAO, ELETRICA, IGNICAO, ARREFECIMENTO, etc.).
- Para peças bilaterais (amortecedor, pastilha, terminal de direção, etc.) tente inferir posição.
- Liste 3 a 5 termos de busca em ordem de relevância.
- "confianca" vai de 0 a 1.

NUNCA invente números OEM. Se não conseguir ler, deixe null.`;

export const SISTEMAS = [
  "MOTOR",
  "FREIO",
  "SUSPENSAO",
  "ELETRICA",
  "IGNICAO",
  "ARREFECIMENTO",
  "TRANSMISSAO",
  "EMBREAGEM",
  "DIRECAO",
  "COMBUSTIVEL",
  "ESCAPAMENTO",
  "AR_CONDICIONADO",
  "CARROCERIA",
  "INTERIOR",
  "RODAS_PNEUS",
  "ACESSORIOS",
  "LUBRIFICANTES",
  "FERRAMENTAS",
  "OUTROS",
] as const;

// Strict mode: todos os campos obrigatórios; "não sei" é null, nunca omitido.
export const identificacaoSchema = z.object({
  categoria: z.string(),
  sistema: z.enum(SISTEMAS),
  marca: z.string().nullable(),
  codigoOemLido: z.string().nullable(),
  codigoFabricanteLido: z.string().nullable(),
  numeroSerie: z.string().nullable(),
  posicao: z.string().nullable(),
  estado: z.enum(["NOVA", "USADA_BOA", "USADA_RUIM", "DANIFICADA", "DESCONHECIDO"]),
  observacoes: z.string(),
  termosBuscaSugeridos: z.array(z.string()),
  confianca: z.number(),
});

export type IdentificacaoPeca = z.infer<typeof identificacaoSchema>;

export async function identificarPecaPorImagem(
  empresaId: string,
  imagensBase64: string[],
  mimeType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg",
): Promise<IdentificacaoPeca> {
  const r = await chamarEstruturado({
    empresaId,
    recurso: "vision",
    papel: "default",
    maxTokens: 2048,
    schema: identificacaoSchema,
    nomeSchema: "identificacao_peca",
    mensagens: [
      { role: "system", content: SYSTEM_PROMPT_VISION },
      {
        role: "user",
        content: [
          ...imagensBase64.map((b64) => ({
            type: "image_url" as const,
            image_url: { url: `data:${mimeType};base64,${b64}` },
          })),
          { type: "text" as const, text: "Analise a(s) foto(s) e identifique a peça." },
        ],
      },
    ],
  });
  return {
    ...r,
    confianca: Math.min(Math.max(r.confianca, 0), 1),
    termosBuscaSugeridos: r.termosBuscaSugeridos.map((t) => t.trim()).filter(Boolean).slice(0, 5),
  };
}
