import { NextResponse } from "next/server";
import { comAuth } from "@/lib/auth/guard";
import { salvarConfigFiscal, telaConfigFiscal } from "@/lib/nfe/config-fiscal-servico";

// Configurações > Fiscal (FINANCEIRO ou acima).
// GET → dados da tela, segredos só mascarados, e o checklist de prontidão.
// PUT → grava; segredos (token, CSC) vão cifrados. Erros de campo em português.
export const GET = comAuth("FINANCEIRO", async (_req, _ctx, usuario) => {
  return NextResponse.json(await telaConfigFiscal(usuario.empresaId));
});

export const PUT = comAuth("FINANCEIRO", async (req, _ctx, usuario) => {
  const r = await salvarConfigFiscal(usuario.empresaId, usuario.id, await req.json().catch(() => ({})));
  if (!r.ok) {
    return NextResponse.json({ erro: "Confira os campos destacados.", campos: r.campos }, { status: 400 });
  }
  return NextResponse.json({ ...(await telaConfigFiscal(usuario.empresaId)), focus: r.focus });
});
