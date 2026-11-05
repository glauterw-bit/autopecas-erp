import type OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { esforcoPara, modeloPara, openai, type PapelModelo } from "./client";
import { ErroIA, garantirDentroDoTeto, registrarUso } from "./uso";

// Chamada única para a OpenAI: confere o teto da loja, chama, registra o custo.
// `chamarEstruturado` usa Structured Outputs (json_schema strict) e valida com Zod;
// recusa do modelo, resposta cortada ou fora do schema viram erro claro, e nada é gravado.

export interface OpcoesChamada {
  empresaId: string;
  recurso: string;
  papel: PapelModelo;
  mensagens: OpenAI.Chat.ChatCompletionMessageParam[];
  maxTokens?: number;
  tools?: OpenAI.Chat.ChatCompletionTool[];
}

export async function chamarIA(
  opts: OpcoesChamada & { responseFormat?: OpenAI.Chat.ChatCompletionCreateParams["response_format"] },
): Promise<OpenAI.Chat.ChatCompletion> {
  if (!process.env.OPENAI_API_KEY) {
    throw new ErroIA(503, "A IA não está configurada neste servidor (falta a chave da OpenAI).");
  }
  await garantirDentroDoTeto(opts.empresaId);

  const modelo = modeloPara(opts.papel);
  const esforco = esforcoPara(opts.papel);
  const resp = await openai.chat.completions.create({
    model: modelo,
    max_completion_tokens: opts.maxTokens ?? 2048,
    messages: opts.mensagens,
    ...(opts.tools && { tools: opts.tools }),
    ...(opts.responseFormat && { response_format: opts.responseFormat }),
    // O tipo do SDK 4.x ainda não conhece "none"/"xhigh"/"max".
    ...(esforco && { reasoning_effort: esforco as never }),
  });

  await registrarUso({
    empresaId: opts.empresaId,
    recurso: opts.recurso,
    modelo: resp.model || modelo,
    uso: resp.usage,
  });
  return resp;
}

export async function chamarEstruturado<S extends z.ZodTypeAny>(
  opts: OpcoesChamada & { schema: S; nomeSchema: string },
): Promise<z.infer<S>> {
  const resp = await chamarIA({
    ...opts,
    responseFormat: zodResponseFormat(opts.schema, opts.nomeSchema),
  });
  return lerRespostaEstruturada(resp, opts.schema);
}

/** Valida a resposta: recusa, corte por tamanho, JSON e schema Zod. */
export function lerRespostaEstruturada<S extends z.ZodTypeAny>(
  resp: OpenAI.Chat.ChatCompletion,
  schema: S,
): z.infer<S> {
  const escolha = resp.choices[0];
  const msg = escolha?.message;
  if (msg?.refusal) {
    throw new ErroIA(422, `A IA recusou o pedido: ${msg.refusal}`);
  }
  if (escolha?.finish_reason === "length") {
    throw new ErroIA(
      502,
      "A resposta da IA veio cortada. Nada foi gravado; tente de novo com menos itens ou páginas.",
    );
  }
  if (!msg?.content) {
    throw new ErroIA(502, "A IA não devolveu resposta. Nada foi gravado; tente de novo.");
  }
  let bruto: unknown;
  try {
    bruto = JSON.parse(msg.content);
  } catch {
    throw new ErroIA(502, "A IA devolveu dados fora do formato esperado. Nada foi gravado; tente de novo.");
  }
  const r = schema.safeParse(bruto);
  if (!r.success) {
    console.error("[ia] resposta fora do schema", r.error.issues.slice(0, 5));
    throw new ErroIA(502, "A IA devolveu dados fora do formato esperado. Nada foi gravado; tente de novo.");
  }
  return r.data;
}
