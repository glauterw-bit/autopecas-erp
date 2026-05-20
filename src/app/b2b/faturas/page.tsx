import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { clienteAtualB2B } from "@/lib/b2b/sessao";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function FaturasB2B() {
  const cliente = await clienteAtualB2B();
  if (!cliente) redirect("/b2b/login");

  const faturas = await prisma.contaReceber.findMany({
    where: { clienteId: cliente.id },
    orderBy: { dataVencimento: "asc" },
    take: 100,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Minhas faturas</h1>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary text-left">
              <tr>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Parcela</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {faturas.map((f) => {
                const atrasada = f.dataVencimento.getTime() < Date.now() && f.status !== "PAGO";
                return (
                  <tr key={f.id} className="border-b">
                    <td className="px-4 py-2">{f.descricao}</td>
                    <td className="px-4 py-2 text-xs">{f.parcela}/{f.totalParcelas}</td>
                    <td className="px-4 py-2 text-xs">{formatDate(f.dataVencimento)}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatBRL(Number(f.valor))}</td>
                    <td className="px-4 py-2">
                      <Badge variant={f.status === "PAGO" ? "success" : atrasada ? "destructive" : "warning"}>
                        {atrasada ? "ATRASADA" : f.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
              {faturas.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Sem faturas.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
