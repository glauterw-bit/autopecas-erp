import { NextResponse } from "next/server";
import { comAuth } from "@/lib/auth/guard";
import { assinarState, COOKIE_NONCE, urlAutorizacaoML, VALIDADE_STATE_MS } from "@/lib/marketplaces/ml-oauth";

// Início da conexão com o Mercado Livre. Devolve a URL de autorização (a tela
// manda o navegador para ela) e grava o nonce em cookie httpOnly: o callback
// só aceita o retorno no mesmo navegador que começou o fluxo.
export const GET = comAuth("GERENTE", async (_req, _ctx, usuario) => {
  const { state, nonce } = assinarState({ empresaId: usuario.empresaId, usuarioId: usuario.id });
  const res = NextResponse.json({ url: urlAutorizacaoML(state) });
  res.cookies.set(COOKIE_NONCE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/marketplaces/ml",
    maxAge: Math.floor(VALIDADE_STATE_MS / 1000),
  });
  return res;
});
