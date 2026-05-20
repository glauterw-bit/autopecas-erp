import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { clienteAtualB2B } from "@/lib/b2b/sessao";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PedidosB2B() {
  const cliente = await clienteAtualB2B();
  if (!cliente) redirect("/b2b/login");

  const vendas = await prisma.venda.findMany({
    where: { clienteId: cliente.id },
    orderBy: { criadaEm: "desc" },
    include: { itens: { include: { produto: true } } },
    take: 50,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Meus pedidos</h1>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary text-left">
              <tr>
                <th className="px-4 py-3">Pedido</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Itens</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {vendas.map((v) => (
                <tr key={v.id} className="border-b">
                  <td className="px-4 py-2 font-mono">#{v.numero}</td>
                  <td className="px-4 py-2 text-xs">{formatDate(v.criadaEm)}</td>
                  <td className="px-4 py-2 text-xs">{v.itens.length}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatBRL(Number(v.valorTotal))}</td>
                  <td className="px-4 py-2">
                    <Badge variant={v.status === "PAGA" || v.status === "FATURADA" ? "success" : "warning"}>
                      {v.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {vendas.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Sem pedidos.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
