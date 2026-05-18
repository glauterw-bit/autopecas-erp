import { AI_MODELS, extrairJson, openai } from "./client";

// AutoVision AI
// =============
// Usuário fotografa a peça e a IA identifica:
//   - categoria / sistema veicular
//   - sinais de marca, número de série, código OEM impressos
//   - estado/desgaste aparente
//   - sugestão de termos de busca para localizar no catálogo
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
  const resp = await openai.chat.completions.create({
    model: AI_MODELS.default,
    max_completion_tokens: 1024,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT_VISION },
      {
        role: "user",
        content: [
          ...imagensBase64.map((b64) => ({
            type: "image_url" as const,
            image_url: { url: `data:${mimeType};base64,${b64}` },
          })),
          {
            type: "text" as const,
            text: `Analise a(s) foto(s) e responda APENAS o JSON no formato:
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

  const texto = resp.choices[0]?.message?.content ?? "";
  return extrairJson<IdentificacaoPeca>(texto);
}
