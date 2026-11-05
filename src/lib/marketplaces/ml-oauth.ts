import crypto from "node:crypto";
import axios from "axios";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { ApiError } from "../auth/guard";
import { CHAVE_IMPORTAR_DESDE, mesclarConfiguracoes } from "./config-conta";
import { tokensParaGravar } from "./tokens";

// OAuth do Mercado Livre (Authorization Code, server side)
// ========================================================
// Docs: https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao
//  - autorização: https://auth.mercadolivre.com.br/authorization?response_type=code&client_id&redirect_uri&state
//  - troca: POST https://api.mercadolibre.com/oauth/token (grant_type=authorization_code)
// O redirect_uri tem de ser idêntico ao cadastrado no app (ML_REDIRECT_URI) e
// não pode ter parte variável: por isso o contexto vai no `state`.
//
// `state` = base64url(JSON{e: empresaId, u: usuarioId, n: nonce, x: expira}) + "." + HMAC-SHA256.
// Defesas: assinatura (ninguém forja empresa), validade de 10 min, e o nonce
// também vai num cookie httpOnly do navegador que iniciou o fluxo (CSRF de login:
// quem clica num link de terceiro não tem o cookie).

export const VALIDADE_STATE_MS = 10 * 60_000;
export const COOKIE_NONCE = "ml_oauth_nonce";
const AUTH_URL = "https://auth.mercadolivre.com.br/authorization";
const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

export interface DadosState {
  empresaId: string;
  usuarioId: string;
  nonce: string;
  expiraEm: number;
}

function segredo(env: NodeJS.ProcessEnv = process.env): string {
  // Segredo próprio do state: não reaproveita o da sessão (NEXTAUTH_SECRET).
  const s = env.ML_STATE_SECRET;
  if (!s || s.length < 16) throw new ApiError(503, "Integração do Mercado Livre não configurada");
  return s;
}

const hmac = (corpo: string, s: string) => crypto.createHmac("sha256", s).update(corpo).digest("base64url");

export function assinarState(
  d: Omit<DadosState, "nonce" | "expiraEm"> & { nonce?: string; agora?: number },
  env: NodeJS.ProcessEnv = process.env,
): { state: string; nonce: string } {
  const nonce = d.nonce ?? crypto.randomBytes(16).toString("base64url");
  const corpo = Buffer.from(
    JSON.stringify({ e: d.empresaId, u: d.usuarioId, n: nonce, x: (d.agora ?? Date.now()) + VALIDADE_STATE_MS }),
  ).toString("base64url");
  return { state: `${corpo}.${hmac(corpo, segredo(env))}`, nonce };
}

/** Valida assinatura (tempo constante) e validade. Devolve null se qualquer coisa falhar. */
export function verificarState(
  state: string | null | undefined,
  agora = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): DadosState | null {
  if (!state) return null;
  const [corpo, assinatura, resto] = state.split(".");
  if (!corpo || !assinatura || resto !== undefined) return null;
  const esperado = Buffer.from(hmac(corpo, segredo(env)));
  const recebido = Buffer.from(assinatura);
  if (esperado.length !== recebido.length || !crypto.timingSafeEqual(esperado, recebido)) return null;
  try {
    const j = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) as { e?: string; u?: string; n?: string; x?: number };
    if (!j.e || !j.u || !j.n || typeof j.x !== "number" || j.x < agora) return null;
    return { empresaId: j.e, usuarioId: j.u, nonce: j.n, expiraEm: j.x };
  } catch {
    return null;
  }
}

export function urlAutorizacaoML(state: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!env.ML_APP_ID || !env.ML_REDIRECT_URI) throw new Error("ML_APP_ID e ML_REDIRECT_URI não configurados");
  const q = new URLSearchParams({
    response_type: "code",
    client_id: env.ML_APP_ID,
    redirect_uri: env.ML_REDIRECT_URI,
    state,
  });
  return `${AUTH_URL}?${q.toString()}`;
}

export interface TokenML {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number | string;
}

export async function trocarCodePorToken(code: string, env: NodeJS.ProcessEnv = process.env): Promise<TokenML> {
  if (!env.ML_APP_ID || !env.ML_CLIENT_SECRET || !env.ML_REDIRECT_URI) {
    throw new Error("Credenciais do app do Mercado Livre não configuradas");
  }
  try {
    const { data } = await axios.post<TokenML>(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: env.ML_APP_ID,
        client_secret: env.ML_CLIENT_SECRET,
        code,
        redirect_uri: env.ML_REDIRECT_URI,
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, timeout: 15_000 },
    );
    return data;
  } catch (e) {
    // Sem corpo/headers do erro: carregam client_secret e code.
    const status = axios.isAxiosError(e) ? e.response?.status : undefined;
    throw new Error(`Mercado Livre recusou a autorização (HTTP ${status ?? "sem resposta"})`);
  }
}

/**
 * Grava (ou reconecta) a conta ML da empresa. Reconexão da mesma conta externa
 * mantém a data de "importar pedidos desde"; conta nova começa agora, para não
 * lançar em dobro o que a loja já digitou à mão.
 */
export async function salvarContaML(empresaId: string, t: TokenML, agora = new Date()) {
  const contaExternaId = String(t.user_id);
  const dados = {
    ...tokensParaGravar({ accessToken: t.access_token, refreshToken: t.refresh_token }),
    expiraEm: new Date(agora.getTime() + Number(t.expires_in ?? 21600) * 1000),
    ativa: true,
  };
  const existente = await prisma.marketplaceConta.findFirst({
    where: { empresaId, plataforma: "MERCADO_LIVRE", contaExternaId },
    select: { id: true, configuracoes: true },
  });
  if (existente) {
    const cfg = mesclarConfiguracoes(existente.configuracoes, {});
    if (!cfg[CHAVE_IMPORTAR_DESDE]) cfg[CHAVE_IMPORTAR_DESDE] = agora.toISOString();
    await prisma.marketplaceConta.update({
      where: { id: existente.id },
      data: { ...dados, configuracoes: cfg as Prisma.InputJsonValue },
    });
    return { contaId: existente.id, nova: false };
  }
  const criada = await prisma.marketplaceConta.create({
    data: {
      empresaId,
      plataforma: "MERCADO_LIVRE",
      nomeReferencia: `Mercado Livre ${contaExternaId}`,
      contaExternaId,
      configuracoes: { [CHAVE_IMPORTAR_DESDE]: agora.toISOString() },
      ...dados,
    },
    select: { id: true },
  });
  return { contaId: criada.id, nova: true };
}
