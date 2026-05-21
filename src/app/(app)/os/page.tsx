import { prisma } from "@/lib/db";
import { empresaAtualId } from "@/lib/sessao";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDateTime, maskPlaca } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statusVariant: Record<string, "muted" | "warning" | "success" | "destructive" | "accent"> = {
  ABERTA: "warning",
  EM_ANALISE: "warning",
  AGUARDANDO_APROVACAO: "warning",
  APROVADA: "accent",
  EM_EXECUCAO: "accent",
  AGUARDANDO_PECA: "warning",
  CONCLUIDA: "success",
  ENTREGUE: "success",
  CANCELADA: "destructive",
  GARANTIA: "destructive",
};

export default async function OSPage() {
  const empresaId = await empresaAtualId();
  const ordens = await prisma.ordemServico.findMany({
    where: { empresaId },
    include: { itensServico: true },
    orderBy: { abertaEm: "desc" },
    take: 100,
  });
  const clientesIds = ordens.map((o) => o.clienteId).filter((x): x is string => !!x);
  const clientesArr = clientesIds.length > 0
    ? await prisma.cliente.findMany({ where: { id: { in: clientesIds } }, select: { id: true, nome: true } })
    : [];
  const clientesById = new Map(clientesArr.map((c) => [c.id, c.nome] as const));
  const contagem = await prisma.ordemServico.groupBy({
    by: ["status"],
    where: { empresaId },
    _count: { _all: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Ordens de Serviço</h1>
        <p className="text-muted-foreground">
          Gestão de oficina: diagnóstico, mão de obra, peças aplicadas, garantia
          técnica, NFS-e do serviço. Vincula veículo do cliente + histórico.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
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
                <th className="px-4 py-3">OS</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Placa</th>
                <th className="px-4 py-3">Aberta em</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {ordens.map((os) => (
                <tr key={os.id} className="border-b hover:bg-secondary/50">
                  <td className="px-4 py-2 font-mono">#{String(os.numero).padStart(5, "0")}</td>
                  <td className="px-4 py-2">{os.clienteId ? clientesById.get(os.clienteId) ?? "—" : "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs">{maskPlaca(os.placa)}</td>
                  <td className="px-4 py-2 text-xs">{formatDateTime(os.abertaEm)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatBRL(Number(os.valorTotal))}</td>
                  <td className="px-4 py-2">
                    <Badge variant={statusVariant[os.status] ?? "muted"}>{os.status}</Badge>
                  </td>
                </tr>
              ))}
              {ordens.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Sem ordens de serviço. POST /api/os para criar.
                </td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
