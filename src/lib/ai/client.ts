import OpenAI from "openai";

// Cliente OpenAI usado em todos os recursos de IA do sistema.
//
// Papéis de modelo (troque o modelo só aqui ou pela variável de ambiente):
// - reasoning → análise gerencial com raciocínio mais longo
// - default   → tarefas estruturadas com visão (OCR de DANFE, foto da peça, SmartCross)
// - fast      → alta frequência e baixa latência (explicações curtas)
// - tools     → chat com function calling (Copiloto de balcão / WhatsApp)
//
// Fonte (consultada em 04/11/2026):
// - https://developers.openai.com/api/docs/deprecations: gpt-4o (2024-08-06, 2024-11-20)
//   e gpt-4o-mini (2024-07-18) desligam em 14/01/2027; substituto indicado: gpt-6-luna.
// - https://developers.openai.com/api/docs/models/gpt-6-luna: no Chat Completions,
//   function calling só funciona com reasoning_effort "none".
// - https://developers.openai.com/api/docs/models/gpt-6.1-terra: "visual reasoning";
//   tool calling exige a Responses API, por isso NÃO serve para o papel "tools" aqui.
// - https://developers.openai.com/api/docs/pricing: preços abaixo.
//
// Os padrões ainda não foram avaliados com DANFEs e fotos reais da loja. Rode o
// conjunto de avaliação antes de confiar neles. Para voltar ao modelo antigo
// (só até 14/01/2027): OPENAI_MODEL_DEFAULT=gpt-4o (aí o reasoning_effort não é enviado).

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

export type PapelModelo = "reasoning" | "default" | "fast" | "tools";
export type EsforcoRaciocinio = "none" | "low" | "medium" | "high" | "xhigh" | "max";

const MODELO_PADRAO: Record<PapelModelo, string> = {
  reasoning: "gpt-6.1-terra",
  default: "gpt-6.1-terra",
  fast: "gpt-6-luna",
  tools: "gpt-6-luna",
};

const ESFORCO_PADRAO: Record<PapelModelo, EsforcoRaciocinio> = {
  reasoning: "medium",
  default: "low",
  fast: "none",
  tools: "none", // obrigatório para function calling no Chat Completions (gpt-6-luna)
};

const ENV_MODELO: Record<PapelModelo, string> = {
  reasoning: "OPENAI_MODEL_REASONING",
  default: "OPENAI_MODEL_DEFAULT",
  fast: "OPENAI_MODEL_FAST",
  tools: "OPENAI_MODEL_TOOLS",
};

/** Nome do modelo para o papel, com override por variável de ambiente. */
export function modeloPara(papel: PapelModelo): string {
  const v = process.env[ENV_MODELO[papel]]?.trim();
  return v || MODELO_PADRAO[papel];
}

/** Modelos de raciocínio (gpt-5+, gpt-6, série o) aceitam reasoning_effort; gpt-4o não. */
export function aceitaEsforco(modelo: string): boolean {
  return /^(gpt-5|gpt-6|o\d)/.test(modelo);
}

/** Esforço de raciocínio do papel (override: OPENAI_MODEL_<PAPEL>_ESFORCO). */
export function esforcoPara(papel: PapelModelo): EsforcoRaciocinio | undefined {
  if (!aceitaEsforco(modeloPara(papel))) return undefined;
  const v = process.env[`${ENV_MODELO[papel]}_ESFORCO`]?.trim() as EsforcoRaciocinio | undefined;
  return v || ESFORCO_PADRAO[papel];
}

// Compatibilidade com o código antigo: sempre lê o env na hora.
export const AI_MODELS = {
  get reasoning() {
    return modeloPara("reasoning");
  },
  get default() {
    return modeloPara("default");
  },
  get fast() {
    return modeloPara("fast");
  },
  get tools() {
    return modeloPara("tools");
  },
};

// Preço Standard em US$ por 1M tokens (prompts até 272K; imagens entram como tokens de entrada).
// Fonte: https://developers.openai.com/api/docs/pricing (consultado em 04/11/2026).
// Strings para virar Decimal sem erro de float.
export const PRECOS_USD_POR_1M: Record<string, { entrada: string; cache: string; saida: string }> = {
  "gpt-6-astra": { entrada: "10.00", cache: "1.00", saida: "50.00" },
  "gpt-6.1-sol": { entrada: "2.00", cache: "0.10", saida: "10.00" },
  "gpt-6.1-terra": { entrada: "1.00", cache: "0.05", saida: "5.00" },
  "gpt-6-luna": { entrada: "0.10", cache: "0.01", saida: "0.50" },
  "gpt-6-sol": { entrada: "2.00", cache: "0.20", saida: "10.00" },
  "gpt-5.6-sol": { entrada: "4.00", cache: "0.40", saida: "20.00" },
  "gpt-5.6-terra": { entrada: "2.00", cache: "0.20", saida: "12.00" },
  "gpt-5.6-luna": { entrada: "0.20", cache: "0.02", saida: "1.20" },
  "gpt-4o": { entrada: "2.50", cache: "1.25", saida: "10.00" },
  "gpt-4o-mini": { entrada: "0.15", cache: "0.075", saida: "0.60" },
};

// Modelo sem preço na tabela: estima pelo mais caro, para o teto nunca subestimar.
export const PRECO_DESCONHECIDO = PRECOS_USD_POR_1M["gpt-6-astra"];

export function precoDoModelo(modelo: string) {
  if (PRECOS_USD_POR_1M[modelo]) return PRECOS_USD_POR_1M[modelo];
  // Snapshot datado (ex.: gpt-4o-2024-11-20) usa o preço do alias.
  const base = Object.keys(PRECOS_USD_POR_1M)
    .sort((a, b) => b.length - a.length)
    .find((k) => modelo.startsWith(`${k}-`));
  return base ? PRECOS_USD_POR_1M[base] : PRECO_DESCONHECIDO;
}
