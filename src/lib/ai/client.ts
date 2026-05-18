import Anthropic from "@anthropic-ai/sdk";

// Cliente Claude usado em todos os recursos de IA do sistema.
//
// Estratégia de modelos:
// - claude-opus-4-7   → raciocínio profundo (análises gerenciais, planejamento de compras)
// - claude-sonnet-4-6 → tarefas estruturadas (OCR de NF-e, vision, extração de dados)
// - claude-haiku-4-5  → alta-frequência baixa-latência (autocomplete, chat de balcão)

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

export const AI_MODELS = {
  reasoning: "claude-opus-4-7",
  default: "claude-sonnet-4-6",
  fast: "claude-haiku-4-5-20251001",
} as const;

export type AiModel = (typeof AI_MODELS)[keyof typeof AI_MODELS];

// Prompt caching: a maioria dos prompts deste sistema reusa o mesmo
// "system" (regras de negócio, tabela de equivalências curtas, prompt
// engineering). Isso baixa drasticamente o custo. Helpers abaixo já marcam
// o cache_control nos blocos certos.

export function cachedSystem(text: string): Anthropic.Messages.TextBlockParam {
  return {
    type: "text",
    text,
    cache_control: { type: "ephemeral" },
  };
}

export async function completar(opts: {
  modelo?: AiModel;
  system: string | Anthropic.Messages.TextBlockParam[];
  mensagens: Anthropic.Messages.MessageParam[];
  maxTokens?: number;
  tools?: Anthropic.Messages.Tool[];
}) {
  const resp = await anthropic.messages.create({
    model: opts.modelo ?? AI_MODELS.default,
    max_tokens: opts.maxTokens ?? 2048,
    system:
      typeof opts.system === "string" ? [cachedSystem(opts.system)] : opts.system,
    messages: opts.mensagens,
    tools: opts.tools,
  });
  return resp;
}
