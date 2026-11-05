import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, comAuth } from "@/lib/auth/guard";
import { relatorioCsv, type ResultadoImportacao } from "@/lib/implantacao/conferencia";

// GET ?lote=<id>: relatório de conferência + erros/avisos linha a linha, em CSV.
// Sem ?lote: últimos 30 lotes da empresa.
export const GET = comAuth("ADMIN", async (req, _ctx, usuario) => {
  const id = req.nextUrl.searchParams.get("lote");
  if (!id) {
    const lotes = await prisma.importacaoLote.findMany({
      where: { empresaId: usuario.empresaId },
      orderBy: { criadoEm: "desc" },
      take: 30,
      select: { id: true, entidade: true, origem: true, arquivoNome: true, simulacao: true, status: true, criadoEm: true },
    });
    return NextResponse.json(lotes);
  }
  const lote = await prisma.importacaoLote.findFirst({ where: { id, empresaId: usuario.empresaId } });
  if (!lote?.resumo) throw new ApiError(404, "Lote não encontrado");
  const csv = relatorioCsv(lote.resumo as unknown as ResultadoImportacao);
  const nome = `conferencia-${lote.entidade.toLowerCase()}-${lote.criadoEm.toISOString().slice(0, 10)}-${lote.id.slice(-6)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${nome}"`,
      "cache-control": "no-store",
    },
  });
});
