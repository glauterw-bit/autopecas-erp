import { prisma } from "@/lib/db";
import { empresaAtualId } from "@/lib/sessao";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statusVariant: Record<string, "muted" | "warning" | "success" | "destructive" | "accent"> = {
  AGUARDANDO_AUTORIZACAO: "warning",
  AUTORIZADA: "accent",
  AGUARDANDO_RECEBIMENTO: "accent",
  RECEBIDA: "accent",
  EM_ANALISE: "warning",
  APROVADA: "success",
  RECUSADA: "destructive",
  CONCLUIDA: "success",
};

export default async function RMAPage() {
  const empresaId = await empresaAtualId();
  const rmas = await prisma.solicitacaoRMA.findMany({
    where: { empresaId },
    orderBy: { abertaEm: "desc" },
    take: 100,
  });
  const contagem = await prisma.solicitacaoRMA.groupBy({
    by: ["status"],
    where: { empresaId },
    _count: { _all: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">RMA / Devoluções / Garantia</h1>
        <p className="text-muted-foreground">
          Fluxo CDC: solicitação → autorização → recebimento → análise →
          reembolso/troca/reparo/garantia fornecedor.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {contagem.map((c) => (
          <Card key={c.status}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{c.status}</div>
              <div className="text-2xl font-bold">{c._count._all}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary text-left">
              <tr>
                <th className="px-4 py-3">RMA</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Resolução</th>
                <th className="px-4 py-3">Aberta em</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rmas.map((r) => (
                <tr key={r.id} className="border-b hover:bg-secondary/50">
                  <td className="px-4 py-2 font-mono">#{String(r.numeroRMA).padStart(5, "0")}</td>
                  <td className="px-4 py-2 text-xs">{r.motivo.replace(/_/g, " ").toLowerCase()}</td>
                  <td className="px-4 py-2 text-xs">{r.resolucao ?? "—"}</td>
                  <td className="px-4 py-2 text-xs">{formatDateTime(r.abertaEm)}</td>
                  <td className="px-4 py-2 text-right font-mono">{r.valorReembolso ? formatBRL(Number(r.valorReembolso)) : "—"}</td>
                  <td className="px-4 py-2">
                    <Badge variant={statusVariant[r.status] ?? "muted"}>{r.status}</Badge>
                  </td>
                </tr>
              ))}
              {rmas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhum RMA aberto.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
