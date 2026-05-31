import { BarChart3, TrendingUp, Package, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { empresaAtualId } from "@/lib/sessao";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  const empresaId = await empresaAtualId();
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const [topProdutos, topClientes, porFormaPagto, curvaABC] = await Promise.all([
    prisma.$queryRaw<Array<{ nome: string; qtd: number; valor: number }>>`
      SELECT p.nome, SUM(iv.quantidade)::float AS qtd, SUM(iv.total)::float AS valor
        FROM itens_venda iv
        JOIN vendas v ON v.id = iv."vendaId"
        JOIN produtos p ON p.id = iv."produtoId"
       WHERE v."empresaId" = ${empresaId} AND v."criadaEm" >= ${inicioMes} AND v.status NOT IN ('CANCELADA')
       GROUP BY p.id, p.nome ORDER BY valor DESC LIMIT 10`,
    prisma.$queryRaw<Array<{ nome: string; total: number; pedidos: number }>>`
      SELECT c.nome, SUM(v."valorTotal")::float AS total, COUNT(*)::int AS pedidos
        FROM vendas v JOIN clientes c ON c.id = v."clienteId"
       WHERE v."empresaId" = ${empresaId} AND v.status NOT IN ('CANCELADA')
       GROUP BY c.id, c.nome ORDER BY total DESC LIMIT 10`,
    prisma.$queryRaw<Array<{ forma: string; total: number }>>`
      SELECT pg."formaPagamento" AS forma, SUM(pg.valor)::float AS total
        FROM pagamentos_venda pg JOIN vendas v ON v.id = pg."vendaId"
       WHERE v."empresaId" = ${empresaId} AND v.status NOT IN ('CANCELADA')
       GROUP BY pg."formaPagamento" ORDER BY total DESC`,
    prisma.produto.groupBy({
      by: ["curva"],
      where: { empresaId, ativo: true },
      _count: { _all: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Relatórios</h1>
        <p className="text-muted-foreground">
          Top produtos, melhores clientes, formas de pagamento e curva ABC.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-4 w-4" /> Top produtos (mês)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {topProdutos.map((p, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-2">{p.nome}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{Number(p.qtd).toFixed(0)} un</td>
                    <td className="px-4 py-2 text-right font-mono">{formatBRL(Number(p.valor))}</td>
                  </tr>
                ))}
                {topProdutos.length === 0 && <tr><td className="px-4 py-6 text-center text-muted-foreground">Sem vendas no mês.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Melhores clientes</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {topClientes.map((c, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-2">{c.nome}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{c.pedidos} ped.</td>
                    <td className="px-4 py-2 text-right font-mono">{formatBRL(Number(c.total))}</td>
                  </tr>
                ))}
                {topClientes.length === 0 && <tr><td className="px-4 py-6 text-center text-muted-foreground">Sem dados.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Por forma de pagamento</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {porFormaPagto.map((f, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>{f.forma}</span>
                <span className="font-mono">{formatBRL(Number(f.total))}</span>
              </div>
            ))}
            {porFormaPagto.length === 0 && <div className="text-sm text-muted-foreground">Sem dados.</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Curva ABC (produtos)</CardTitle></CardHeader>
          <CardContent className="flex gap-3">
            {["A", "B", "C"].map((curva) => {
              const c = curvaABC.find((x) => x.curva === curva);
              return (
                <div key={curva} className="flex-1 rounded-md border p-4 text-center">
                  <Badge variant={curva === "A" ? "accent" : curva === "B" ? "muted" : "outline"}>Curva {curva}</Badge>
                  <div className="mt-2 text-2xl font-bold">{c?._count._all ?? 0}</div>
                  <div className="text-xs text-muted-foreground">produtos</div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
