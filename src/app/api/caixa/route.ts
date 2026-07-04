import { NextResponse } from "next/server";
import { comAuth } from "@/lib/auth/guard";
import { sessaoAbertaDoUsuario, serializarSessao } from "./_lib";

// GET /api/caixa — estado do caixa do usuário logado.
// Fechamento CEGO: o total esperado NUNCA é retornado enquanto a sessão está
// aberta — ele só sai no resumo do POST /api/caixa/fechar, depois que o
// operador já informou o valor contado.

export const GET = comAuth("CAIXA", async (_req, _ctx, usuario) => {
  const sessao = await sessaoAbertaDoUsuario(usuario);
  if (!sessao) return NextResponse.json({ sessao: null });
  return NextResponse.json({ sessao: serializarSessao(sessao) });
});
