import axios from "axios";

// Utilitários HTTP do Mercado Livre: retry com backoff exponencial + jitter e
// paginação por scan (sem o teto de 1.000 anúncios do offset).
//
// Docs oficiais (consultadas em 04/11/2026; o fetch automático é bloqueado,
// conferido pelos índices de busca):
// - 429: https://developers.mercadolivre.com.br/pt-br/rate-limit-erro-429
//   Limite por Client ID e por endpoint, sem número publicado. Recomenda
//   backoff com jitter e evitar picos. Scroll expirado também gera 429.
// - Itens e buscas: https://developers.mercadolivre.com.br/pt-br/itens-e-buscas
//   /users/{id}/items/search?search_type=scan devolve scroll_id para passar de
//   1.000 itens. Não misture scroll_id com offset.

export const STATUS_REPETIVEIS = new Set([429, 500, 502, 503, 504]);
const ERROS_REDE = new Set(["ECONNRESET", "ETIMEDOUT", "ECONNABORTED", "EAI_AGAIN", "ENOTFOUND"]);

export interface OpcoesRetry {
  maxTentativas?: number; // total de chamadas, incluindo a primeira
  baseMs?: number;
  tetoMs?: number;
  dormir?: (ms: number) => Promise<void>;
  aleatorio?: () => number; // [0,1)
}

/**
 * Espera antes da próxima tentativa.
 * - Com Retry-After (segundos ou data HTTP): respeita, até 60 s, + até 250 ms de jitter.
 * - Sem: "full jitter" (AWS): aleatório entre 0 e min(teto, base·2^(n-1)), com piso de 100 ms.
 */
export function calcularEspera(
  tentativa: number,
  retryAfter: string | number | undefined | null,
  { baseMs = 500, tetoMs = 30_000, aleatorio = Math.random }: OpcoesRetry = {},
): number {
  if (retryAfter != null && retryAfter !== "") {
    let ms = Number(retryAfter) * 1000;
    if (!Number.isFinite(ms)) {
      const data = Date.parse(String(retryAfter));
      ms = Number.isFinite(data) ? data - Date.now() : NaN;
    }
    if (Number.isFinite(ms) && ms >= 0) return Math.min(ms, 60_000) + Math.floor(aleatorio() * 250);
  }
  const exp = Math.min(tetoMs, baseMs * 2 ** Math.max(0, tentativa - 1));
  return Math.max(100, Math.floor(aleatorio() * exp));
}

export function ehRepetivel(e: unknown): { repetir: boolean; retryAfter?: string } {
  if (axios.isAxiosError(e)) {
    const status = e.response?.status;
    if (status && STATUS_REPETIVEIS.has(status)) {
      const h = e.response?.headers?.["retry-after"];
      return { repetir: true, retryAfter: h == null ? undefined : String(h) };
    }
    if (!e.response && e.code && ERROS_REDE.has(e.code)) return { repetir: true };
    return { repetir: false };
  }
  return { repetir: false };
}

export async function comRetryML<T>(fn: () => Promise<T>, opcoes: OpcoesRetry = {}): Promise<T> {
  const max = opcoes.maxTentativas ?? 6;
  const dormir = opcoes.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await fn();
    } catch (e) {
      const { repetir, retryAfter } = ehRepetivel(e);
      if (!repetir || tentativa >= max) throw e;
      await dormir(calcularEspera(tentativa, retryAfter, opcoes));
    }
  }
}

export interface PaginaScan {
  results?: string[];
  scroll_id?: string | null;
  paging?: { total?: number };
}

/**
 * Lista TODOS os ids de anúncio de um vendedor por scan/scroll.
 * `buscar(params)` faz o GET /users/{id}/items/search com os params dados.
 * Para quando: página vazia, sem scroll_id, total atingido, ou a página só
 * repete ids já vistos (proteção contra laço infinito). Sem teto de páginas.
 */
export async function listarIdsPorScan(
  buscar: (params: Record<string, string | number>) => Promise<PaginaScan>,
  limite = 100,
): Promise<string[]> {
  const vistos = new Set<string>();
  const ids: string[] = [];
  let scrollId: string | null | undefined;
  let total: number | undefined;
  for (;;) {
    const params: Record<string, string | number> = { search_type: "scan", limit: limite };
    if (scrollId) params.scroll_id = scrollId;
    const pagina = await buscar(params);
    const resultados = pagina.results ?? [];
    total ??= pagina.paging?.total;
    let novos = 0;
    for (const id of resultados) {
      if (!vistos.has(id)) {
        vistos.add(id);
        ids.push(id);
        novos++;
      }
    }
    if (resultados.length === 0 || novos === 0 || !pagina.scroll_id) break;
    if (total != null && ids.length >= total) break;
    scrollId = pagina.scroll_id;
  }
  return ids;
}
