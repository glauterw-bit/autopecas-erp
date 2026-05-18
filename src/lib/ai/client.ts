import OpenAI from "openai";

// Cliente OpenAI usado em todos os recursos de IA do sistema.
//
// Estratégia de modelos:
// - reasoning → tarefas com cadeia de pensamento longa (análise gerencial)
// - default   → tarefas estruturadas com visão (OCR, vision, extração)
// - fast      → alta-frequência baixa-latência (chat, autocomplete, explicações curtas)
//
// Centralizamos os nomes aqui; trocar de modelo afeta o sistema inteiro.

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

export const AI_MODELS = {
  reasoning: "gpt-4o",
  default: "gpt-4o",
  fast: "gpt-4o-mini",
} as const;

export type AiModel = (typeof AI_MODELS)[keyof typeof AI_MODELS];

// Helper: chamada padrão pra Chat Completions com forçagem opcional de JSON.
// A OpenAI faz prompt caching automaticamente em prompts >= 1024 tokens.
export async function completar(opts: {
  modelo?: AiModel;
  system: string;
  mensagens: OpenAI.Chat.ChatCompletionMessageParam[];
  maxTokens?: number;
  json?: boolean;
  tools?: OpenAI.Chat.ChatCompletionTool[];
}) {
  return openai.chat.completions.create({
    model: opts.modelo ?? AI_MODELS.default,
    max_completion_tokens: opts.maxTokens ?? 2048,
    response_format: opts.json ? { type: "json_object" } : undefined,
    messages: [{ role: "system", content: opts.system }, ...opts.mensagens],
    tools: opts.tools,
  });
}

// Extrai o primeiro JSON válido de uma resposta da IA (defensivo).
export function extrairJson<T>(texto: string): T {
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Resposta da IA não contém JSON válido");
  return JSON.parse(m[0]) as T;
}
