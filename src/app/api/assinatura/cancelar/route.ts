import { NextResponse } from "next/server";
import { comAuth } from "@/lib/auth/guard";
import { cancelarAssinatura } from "@/lib/assinatura/servico";

// Cancelar a assinatura (só ADMIN). Não apaga nenhum dado da loja.
export const POST = comAuth("ADMIN", async (_req, _ctx, usuario) => {
  const r = await cancelarAssinatura({ id: usuario.id, empresaId: usuario.empresaId });
  return NextResponse.json(r);
});
