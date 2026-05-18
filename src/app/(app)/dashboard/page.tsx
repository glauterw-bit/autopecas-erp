import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Sparkles, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { empresaAtualId } from "@/lib/sessao";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/utils";

async function carregarDados() {
  const empresaId = await empresaAtualId();
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);

  const [hoje, mes, receber, pagar, insights] = await Promise.all([
    prisma.venda.aggregate({
      where: { empresaId, criadaEm: { gte: inicioHoje }, status: { not: "CANCELADA" } },
      _sum: { valorTotal: true, margemBruta: true },
      _count: { _all: true },
    }),
    prisma.venda.aggregate({
      where: { empresaId, criadaEm: { gte: inicioMes }, status: { not: "CANCELADA" } },
      _sum: { valorTotal: true, margemBruta: true },
      _count: { _all: true },
    }),
    prisma.contaReceber.aggregate({
      where: { empresaId, status: { in: ["ABERTO", "PARCIALMENTE_PAGO", "ATRASADO"] } },
      _sum: { valor: true, valorRecebido: true },
      _count: { _all: true },
    }),
    prisma.contaPagar.aggregate({
      where: { empresaId, status: { in: ["ABERTO", "PARCIALMENTE_PAGO", "ATRASADO"] } },
      _sum: { valor: true, valorPago: true },
      _count: { _all: true },
    }),
    prisma.insightIA.findMany({
      where: { empresaId, resolvidoEm: null },
      orderBy: [{ severidade: "asc" }, { criadoEm: "desc" }],
      take: 8,
    }),
  ]);

  return { hoje, mes, receber, pagar, insights };
}

export default async function DashboardPage() {
  const { hoje, mes, receber, pagar, insights } = await carregarDados();

  const cards = [
    {
      titulo: "Vendas hoje",
      valor: formatBRL(Number(hoje._sum.valorTotal ?? 0)),
      sub: `${hoje._count._all} ${hoje._count._all === 1 ? "venda" : "vendas"} · margem ${formatBRL(Number(hoje._sum.margemBruta ?? 0))}`,
      icon: ArrowUpRight,
      cor: "text-emerald-600",
    },
    {
      titulo: "Vendas do mês",
      valor: formatBRL(Number(mes._sum.valorTotal ?? 0)),
      sub: `${mes._count._all} pedidos`,
      icon: ArrowUpRight,
      cor: "text-emerald-600",
    },
    {
      titulo: "A receber",
      valor: formatBRL(
        Number(receber._sum.valor ?? 0) - Number(receber._sum.valorRecebido ?? 0),
      ),
      sub: `${receber._count._all} contas`,
      icon: Wallet,
      cor: "text-blue-600",
    },
    {
      titulo: "A pagar",
      valor: formatBRL(Number(pagar._sum.valor ?? 0) - Number(pagar._sum.valorPago ?? 0)),
      sub: `${pagar._count._all} contas`,
      icon: ArrowDownRight,
      cor: "text-red-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral da operação com sinais da IA.</p>
        </div>
        <Button asChild variant="accent">
          <Link href="/pdv">Abrir PDV</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.titulo}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {c.titulo}
                </CardTitle>
                <Icon className={`h-4 w-4 ${c.cor}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{c.valor}</div>
                <div className="text-xs text-muted-foreground">{c.sub}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              Insights da IA
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Sinais detectados nas últimas horas pelos módulos StockPredict,
              MarginGuard, DemandSense e SmartCross.
            </p>
          </div>
          <Button variant="ghost" asChild>
            <Link href="/ia">Ver todos</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {insights.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum insight aberto. Tudo sob controle.
            </div>
          ) : (
            insights.map((i) => (
              <div
                key={i.id}
                className="flex items-start gap-3 rounded-md border bg-card p-3"
              >
                <AlertTriangle
                  className={`mt-0.5 h-4 w-4 ${
                    i.severidade === "CRITICO"
                      ? "text-red-600"
                      : i.severidade === "AVISO"
                        ? "text-amber-600"
                        : "text-muted-foreground"
                  }`}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{i.titulo}</div>
                    <Badge variant={i.severidade === "CRITICO" ? "destructive" : "warning"}>
                      {i.tipo.replace("_", " ").toLowerCase()}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">{i.descricao}</div>
                  {i.acaoSugerida && (
                    <div className="mt-1 text-sm text-foreground">
                      <span className="font-medium">Sugestão:</span> {i.acaoSugerida}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
