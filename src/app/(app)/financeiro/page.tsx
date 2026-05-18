import { prisma } from "@/lib/db";
import { empresaAtualId } from "@/lib/sessao";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function FinanceiroPage() {
  const empresaId = await empresaAtualId();
  const [receber, pagar] = await Promise.all([
    prisma.contaReceber.findMany({
      where: { empresaId, status: { in: ["ABERTO", "PARCIALMENTE_PAGO", "ATRASADO"] } },
      include: { cliente: true },
      orderBy: { dataVencimento: "asc" },
      take: 50,
    }),
    prisma.contaPagar.findMany({
      where: { empresaId, status: { in: ["ABERTO", "PARCIALMENTE_PAGO", "ATRASADO"] } },
      include: { fornecedor: true },
      orderBy: { dataVencimento: "asc" },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Financeiro</h1>
        <p className="text-muted-foreground">
          Contas a receber/pagar, fluxo de caixa e conciliação bancária.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>A receber</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {receber.length === 0 ? (
              <div className="text-sm text-muted-foreground">Nenhuma conta aberta.</div>
            ) : (
              receber.map((c) => {
                const venc = new Date(c.dataVencimento);
                const atrasada = venc.getTime() < Date.now();
                return (
                  <div key={c.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="font-medium">{c.descricao}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.cliente?.nome ?? "Sem cliente"} · vence {formatDate(venc)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-semibold">{formatBRL(Number(c.valor))}</div>
                      {atrasada && <Badge variant="destructive">atrasada</Badge>}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>A pagar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pagar.length === 0 ? (
              <div className="text-sm text-muted-foreground">Nenhuma conta aberta.</div>
            ) : (
              pagar.map((c) => {
                const venc = new Date(c.dataVencimento);
                const atrasada = venc.getTime() < Date.now();
                return (
                  <div key={c.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="font-medium">{c.descricao}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.fornecedor?.razaoSocial ?? "—"} · vence {formatDate(venc)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-semibold">{formatBRL(Number(c.valor))}</div>
                      {atrasada && <Badge variant="destructive">atrasada</Badge>}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
