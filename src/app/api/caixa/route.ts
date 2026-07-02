import { NextResponse } from "next/server";
import { comAuth } from "@/lib/auth/guard";
import { esperadoDinheiro, sessaoAbertaDoUsuario, serializarSessao } from "./_lib";

// GET /api/caixa — estado do caixa do usuário logado.
// Com ?cego=1 (fechamento cego), o total esperado NUNCA é retornado enquanto
// a sessão estiver aberta: o operador informa o contado antes de ver o esperado.

export const GET = comAuth("CAIXA", async (req, _ctx, usuario) => {
  const sessao = await sessaoAbertaDoUsuario(usuario);
  if (!sessao) return NextResponse.json({ sessao: null });

  const cego = req.nextUrl.searchParams.get("cego") === "1";
  const base = serializarSessao(sessao);

  if (cego) return NextResponse.json({ sessao: base });

  const esperado = await esperadoDinheiro(sessao, usuario);
  return NextResponse.json({ sessao: { ...base, esperadoDinheiro: esperado } });
});
