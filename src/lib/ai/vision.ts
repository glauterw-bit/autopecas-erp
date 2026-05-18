import { AI_MODELS, anthropic, cachedSystem } from "./client";

// AutoVision AI
// =============
// Diferencial competitivo: usuário fotografa a peça (no balcão, na bancada,
// ou cliente envia pelo WhatsApp) e o sistema identifica:
//   - categoria / sistema veicular
//   - sinais de marca, número de série, código OEM impressos
//   - estado/desgaste aparente
//   - sugestão de termos de busca para localizar a peça no catálogo
//
// Em seguida casamos o resultado com SmartCross para encontrar SKU equivalente.

const SYSTEM_PROMPT_VISION = `Você é um especialista em identificação de auto peças com 30 anos de bancada.
Sua tarefa é analisar a foto de uma peça automotiva e retornar uma identificação estruturada.

REGRAS:
- Sempre responda em JSON estrito conforme o schema solicitado.
- Se a peça estiver muito desgastada ou ilegível, indique isso em "observacoes" e baixe a confianca.
- Tente ler códigos impressos: OEM, fabricante (Bosch, NGK, Mahle, Cofap, etc.) e número de série.
- Identifique o sistema (FREIO, MOTOR, SUSPENSAO, ELETRICA, IGNICAO, ARREFECIMENTO, etc.).
- Para peças bilaterais (amortecedor, pastilha, terminal de direção, etc.) tente inferir posição.
- Liste 3 a 5 termos de busca em ordem de relevância.

NUNCA invente números OEM. Se não conseguir ler, deixe null.`;

export interface IdentificacaoPeca {
  categoria: string;
  sistema: string;
  marca: string | null;
  codigoOemLido: string | null;
  codigoFabricanteLido: string | null;
  numeroSerie: string | null;
  posicao: string | null;
  estado: "NOVA" | "USADA_BOA" | "USADA_RUIM" | "DANIFICADA" | "DESCONHECIDO";
  observacoes: string;
  termosBuscaSugeridos: string[];
  confianca: number;
}

export async function identificarPecaPorImagem(
  imagensBase64: string[],
  mimeType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg",
): Promise<IdentificacaoPeca> {
  const resp = await anthropic.messages.create({
    model: AI_MODELS.default,
    max_tokens: 1024,
    system: [cachedSystem(SYSTEM_PROMPT_VISION)],
    messages: [
      {
        role: "user",
        content: [
          ...imagensBase64.map((b64) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: mimeType, data: b64 },
          })),
          {
            type: "text",
            text: `Analise a(s) foto(s) e responda apenas com o JSON no formato:
{
  "categoria": "string",
  "sistema": "MOTOR|FREIO|SUSPENSAO|ELETRICA|IGNICAO|ARREFECIMENTO|TRANSMISSAO|EMBREAGEM|DIRECAO|COMBUSTIVEL|ESCAPAMENTO|AR_CONDICIONADO|CARROCERIA|INTERIOR|RODAS_PNEUS|ACESSORIOS|LUBRIFICANTES|FERRAMENTAS|OUTROS",
  "marca": "string|null",
  "codigoOemLido": "string|null",
  "codigoFabricanteLido": "string|null",
  "numeroSerie": "string|null",
  "posicao": "string|null",
  "estado": "NOVA|USADA_BOA|USADA_RUIM|DANIFICADA|DESCONHECIDO",
  "observacoes": "string curto",
  "termosBuscaSugeridos": ["string"],
  "confianca": 0.0
}`,
          },
        ],
      },
    ],
  });

  const texto = resp.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const jsonMatch = texto.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AutoVision: resposta da IA não contém JSON válido");
  }
  return JSON.parse(jsonMatch[0]) as IdentificacaoPeca;
}

// Tipo do SDK: precisamos importar o namespace para tipos auxiliares.
import type Anthropic from "@anthropic-ai/sdk";
