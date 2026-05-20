import { redirect } from "next/navigation";
import { Car, ShoppingBag, AlertCircle, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { clienteAtualB2B } from "@/lib/b2b/sessao";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL, maskCpfCnpj } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function B2BHomePage() {
  const cliente = await clienteAtualB2B();
  if (!cliente) redirect("/b2b/login");

  const [contasAbertas, ultimasVendas] = await Promise.all([
    prisma.contaReceber.aggregate({
      where: {
        clienteId: cliente.id,
        status: { in: ["ABERTO", "PARCIALMENTE_PAGO", "ATRASADO"] },
      },
      _sum: { valor: true, valorRecebido: true },
      _count: { _all: true },
    }),
    prisma.venda.findMany({
      where: { clienteId: cliente.id, status: { not: "CANCELADA" } },
      orderBy: { criadaEm: "desc" },
      take: 5,
      include: { itens: true },
    }),
  ]);

  const aPagar =
    Number(contasAbertas._sum.valor ?? 0) - Number(contasAbertas._sum.valorRecebido ?? 0);
  const limite = Number(cliente.limiteCredito);
  const usado = limite > 0 ? Math.min(1, aPagar / limite) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Olá, {cliente.nome.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">
          {maskCpfCnpj(cliente.cpfCnpj)} · {cliente.segmento.replace("_", " ").toLowerCase()}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Crédito disponível</span>
              <Wallet className="h-4 w-4" />
            </div>
            <div className="text-2xl font-bold">{formatBRL(Math.max(0, limite - aPagar))}</div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-accent" style={{ width: `${usado * 100}%` }} />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Limite: {formatBRL(limite)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Contas em aberto</span>
              <AlertCircle className="h-4 w-4" />
            </div>
            <div className="text-2xl font-bold">{formatBRL(aPagar)}</div>
            <div className="text-xs text-muted-foreground">
              {contasAbertas._count._all} {contasAbertas._count._all === 1 ? "fatura" : "faturas"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Garagem</span>
              <Car className="h-4 w-4" />
            </div>
            <div className="text-2xl font-bold">{cliente.veiculos.length}</div>
            <div className="text-xs text-muted-foreground">veículos cadastrados</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Últimos pedidos</h2>
            <Link href="/b2b/pedidos" className="text-xs text-accent hover:underline">
              ver todos →
            </Link>
          </div>
          <div className="space-y-2">
            {ultimasVendas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Você ainda não fez pedidos.</p>
            ) : (
              ultimasVendas.map((v) => (
                <Link
                  key={v.id}
                  href={`/b2b/pedidos/${v.id}`}
                  className="flex items-center justify-between rounded-md border p-3 hover:bg-secondary"
                >
                  <div>
                    <div className="text-sm font-medium">Pedido #{v.numero}</div>
                    <div className="text-xs text-muted-foreground">
                      {v.itens.length} {v.itens.length === 1 ? "item" : "itens"} · {new Date(v.criadaEm).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-semibold">{formatBRL(Number(v.valorTotal))}</div>
                    <div className="text-xs text-muted-foreground">{v.status}</div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 text-center">
          <ShoppingBag className="mx-auto mb-2 h-8 w-8 text-accent" />
          <h2 className="text-base font-semibold">Pronto pra fazer um pedido?</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Catálogo com seus preços negociados e aplicação para os veículos da sua garagem.
          </p>
          <Link
            href="/b2b/catalogo"
            className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Abrir catálogo
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
