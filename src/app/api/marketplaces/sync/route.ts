import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sincronizarConta } from "@/lib/marketplaces/unified";
import { comAuth, ApiError } from "@/lib/auth/guard";

export const POST = comAuth("GERENTE", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const { contaId } = (await req.json()) as { contaId?: string };
  if (contaId) {
    const conta = await prisma.marketplaceConta.findFirst({
      where: { id: contaId, empresaId },
      select: { id: true },
    });
    if (!conta) throw new ApiError(404, "Conta de marketplace não encontrada");
    const out = await sincronizarConta(conta.id);
    return NextResponse.json(out);
  }
  // sincroniza todas
  const contas = await prisma.marketplaceConta.findMany({
    where: { empresaId, ativa: true },
    select: { id: true },
  });
  const resultados = [];
  for (const c of contas) {
    try {
      resultados.push({ contaId: c.id, ok: true, ...(await sincronizarConta(c.id)) });
    } catch (e) {
      resultados.push({ contaId: c.id, ok: false, erro: (e as Error).message });
    }
  }
  return NextResponse.json(resultados);
});
