import { NextResponse } from "next/server";
import { ApiError, comAuth } from "@/lib/auth/guard";
import { COOKIE_NONCE, salvarContaML, trocarCodePorToken, verificarState } from "@/lib/marketplaces/ml-oauth";

// Retorno do OAuth do Mercado Livre. Exige sessão GERENTE e que o `state`
// (assinado, com validade) tenha sido emitido para esta empresa/usuário e para
// este navegador (cookie de nonce). Nunca loga code nem tokens.
export const GET = comAuth("GERENTE", async (req, _ctx, usuario) => {
  const params = req.nextUrl.searchParams;
  if (params.get("error")) throw new ApiError(400, "O Mercado Livre não autorizou a conexão");
  const code = params.get("code");
  if (!code) throw new ApiError(400, "Retorno do Mercado Livre sem código de autorização");

  const st = verificarState(params.get("state"));
  const nonceCookie = req.cookies.get(COOKIE_NONCE)?.value;
  if (!st || !nonceCookie || nonceCookie !== st.nonce) {
    throw new ApiError(400, "Pedido de conexão inválido ou expirado. Comece a conexão de novo.");
  }
  // A empresa vem do state assinado e tem de ser a da sessão (nunca de parâmetro solto).
  if (st.empresaId !== usuario.empresaId || st.usuarioId !== usuario.id) {
    throw new ApiError(403, "Esta conexão foi iniciada por outro usuário");
  }

  const token = await trocarCodePorToken(code);
  await salvarContaML(st.empresaId, token);

  const base = process.env.APP_URL?.replace(/\/+$/, "") || req.nextUrl.origin;
  const res = NextResponse.redirect(`${base}/marketplaces?ml=conectado`);
  res.cookies.delete({ name: COOKIE_NONCE, path: "/api/marketplaces/ml" });
  return res;
});
