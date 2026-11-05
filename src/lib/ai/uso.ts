import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { ApiError } from "../auth/guard";
import { precoDoModelo } from "./client";

// Custo da IA por empresa
// =======================
// Cada chamada à OpenAI grava uma linha em UsoIA (tokens e custo estimado em US$).
// Antes de chamar, conferimos o teto mensal da loja:
//   - padrão: IA_TETO_MENSAL_USD (env); sem env, US$ 20 (valor inicial, ajuste com o dono)
//   - por loja: Empresa.configuracoes.iaTetoMensalUsd (sobrepõe o env)
//   - teto 0 desliga a IA para a loja
// O mês é o mês civil no fuso de São Paulo.

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export const TETO_PADRAO_USD = "20";

export class ErroIA extends ApiError {}

export interface UsoTokens {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
}

/** Custo estimado em US$ (Decimal, sem float) de uma chamada. */
export function custoEstimadoUsd(modelo: string, uso: UsoTokens | null | undefined) {
  const preco = precoDoModelo(modelo);
  const prompt = uso?.prompt_tokens ?? 0;
  const cache = Math.min(uso?.prompt_tokens_details?.cached_tokens ?? 0, prompt);
  const entrada = prompt - cache;
  const saida = uso?.completion_tokens ?? 0;
  const custo = new D(entrada)
    .mul(preco.entrada)
    .add(new D(cache).mul(preco.cache))
    .add(new D(saida).mul(preco.saida))
    .div(1_000_000);
  return { custo, tokensEntrada: entrada, tokensCache: cache, tokensSaida: saida };
}

/** Primeiro instante do mês corrente em America/Sao_Paulo (UTC-3, sem horário de verão desde 2019). */
export function inicioDoMesSaoPaulo(agora = new Date()): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(agora);
  const ano = partes.find((p) => p.type === "year")!.value;
  const mes = partes.find((p) => p.type === "month")!.value;
  return new Date(`${ano}-${mes}-01T00:00:00-03:00`);
}

export async function tetoMensalUsd(empresaId: string): Promise<Decimal> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { configuracoes: true },
  });
  const cfg = (empresa?.configuracoes ?? {}) as Record<string, unknown>;
  const daLoja = cfg.iaTetoMensalUsd;
  const bruto =
    daLoja !== undefined && daLoja !== null && daLoja !== ""
      ? String(daLoja)
      : process.env.IA_TETO_MENSAL_USD?.trim() || TETO_PADRAO_USD;
  try {
    return new D(bruto);
  } catch {
    // Config inválida: usa o padrão em vez de liberar sem limite.
    return new D(TETO_PADRAO_USD);
  }
}

export async function gastoNoMesUsd(empresaId: string, agora = new Date()): Promise<Decimal> {
  const r = await prisma.usoIA.aggregate({
    where: { empresaId, criadoEm: { gte: inicioDoMesSaoPaulo(agora) } },
    _sum: { custoUsd: true },
  });
  return new D(r._sum.custoUsd ?? 0);
}

/** Bloqueia com mensagem clara se a loja estourou o teto do mês (ou se a IA está desligada). */
export async function garantirDentroDoTeto(empresaId: string): Promise<void> {
  const [teto, gasto] = await Promise.all([tetoMensalUsd(empresaId), gastoNoMesUsd(empresaId)]);
  if (teto.lte(0)) {
    throw new ErroIA(
      403,
      "A IA está desligada para esta loja. Fale com o administrador do sistema para ligar.",
    );
  }
  if (gasto.gte(teto)) {
    throw new ErroIA(
      429,
      `A loja atingiu o limite mensal de uso da IA (US$ ${teto.toFixed(2)}). ` +
        "O limite renova no dia 1º do próximo mês; para aumentar antes, fale com o administrador do sistema.",
    );
  }
}

export async function registrarUso(opts: {
  empresaId: string;
  recurso: string;
  modelo: string;
  uso: UsoTokens | null | undefined;
  sucesso?: boolean;
}) {
  const c = custoEstimadoUsd(opts.modelo, opts.uso);
  try {
    await prisma.usoIA.create({
      data: {
        empresaId: opts.empresaId,
        recurso: opts.recurso,
        modelo: opts.modelo,
        tokensEntrada: c.tokensEntrada,
        tokensCache: c.tokensCache,
        tokensSaida: c.tokensSaida,
        custoUsd: c.custo,
        sucesso: opts.sucesso ?? true,
      },
    });
  } catch (e) {
    // Falha ao registrar não derruba o atendimento, mas fica no log.
    console.error("[ia] falha ao registrar uso", opts.recurso, (e as Error).message);
  }
  return c.custo;
}
