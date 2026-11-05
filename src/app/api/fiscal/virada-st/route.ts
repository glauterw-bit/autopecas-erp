import { NextResponse } from "next/server";
import { z } from "zod";
import { comAuth } from "@/lib/auth/guard";
import { aplicarViradaSt, previaViradaSt, relatorioEstoqueViradaSt } from "@/lib/fiscal/virada-st";

// Virada da ST de autopeças em SP (Portaria SRE 34/2026).
// GET  ?relatorio=estoque  → estoque de 30/09/2026 com ICMS-ST das entradas (CAT 28/2020), só relatório
// GET                      → prévia: produtos a ajustar e a revisar à mão
// POST { produtoIds }      → aplica o ajuste nos produtos escolhidos (com LogAuditoria)
export const GET = comAuth("FINANCEIRO", async (req, _ctx, usuario) => {
  const url = new URL(req.url);
  if (url.searchParams.get("relatorio") === "estoque") {
    return NextResponse.json(await relatorioEstoqueViradaSt(usuario.empresaId));
  }
  return NextResponse.json(await previaViradaSt(usuario.empresaId));
});

const aplicarSchema = z.object({ produtoIds: z.array(z.string().min(1)).min(1).max(5000) });

export const POST = comAuth("GERENTE", async (req, _ctx, usuario) => {
  const body = aplicarSchema.parse(await req.json());
  const r = await aplicarViradaSt({ empresaId: usuario.empresaId, usuarioId: usuario.id, produtoIds: body.produtoIds });
  return NextResponse.json(r);
});
