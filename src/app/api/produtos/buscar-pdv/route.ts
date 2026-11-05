import { NextResponse } from "next/server";
import { buscarProdutosPDV } from "@/lib/catalogo/busca";
import { comAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";

export const GET = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const termo = req.nextUrl.searchParams.get("q") ?? undefined;
  const versaoId = req.nextUrl.searchParams.get("versao") ?? undefined;
  const resultados = await buscarProdutosPDV({ empresaId, termo, versaoId });
  // Selo de cadastro no balcão: "aplicação verificada" ou "em revisão".
  const ids = resultados.map((r) => r.id);
  const selos = ids.length
    ? await prisma.produto.findMany({
        where: { empresaId, id: { in: ids } },
        select: { id: true, aplicacaoVerificadaEm: true, revisaoCadastro: true },
      })
    : [];
  const porId = new Map(selos.map((s) => [s.id, s]));
  return NextResponse.json(
    resultados.map((r) => ({
      ...r,
      aplicacaoVerificada: !!porId.get(r.id)?.aplicacaoVerificadaEm,
      revisaoCadastro: !!porId.get(r.id)?.revisaoCadastro,
    })),
  );
});
