import { prisma } from "@/lib/db";
import { empresaAtualId } from "@/lib/sessao";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MarketplacesPage() {
  const empresaId = await empresaAtualId();
  const contas = await prisma.marketplaceConta.findMany({
    where: { empresaId },
    include: {
      _count: { select: { anuncios: true, pedidos: true, mensagens: true } },
    },
  });
  const mensagensRecentes = await prisma.mensagemMarketplace.findMany({
    where: { conta: { empresaId }, status: { in: ["NAO_LIDA", "AGUARDANDO_RESPOSTA"] } },
    include: { conta: true },
    orderBy: { recebidaEm: "desc" },
    take: 20,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Marketplaces</h1>
        <p className="text-muted-foreground">
          Mercado Livre, Shopee, Amazon e e-commerce próprio sincronizados em
          tempo real. OmniInbox unifica mensageria pós-venda.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {contas.map((c) => (
          <Card key={c.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{c.nomeReferencia}</CardTitle>
                <Badge variant={c.ativa ? "success" : "muted"}>
                  {c.ativa ? "ativa" : "pausada"}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">{c.plataforma}</div>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Anúncios</span><span>{c._count.anuncios}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Pedidos</span><span>{c._count.pedidos}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Mensagens</span><span>{c._count.mensagens}</span></div>
              <div className="flex justify-between text-xs text-muted-foreground pt-2">
                <span>Último sync</span><span>{c.ultimoSync ? formatDateTime(c.ultimoSync) : "—"}</span>
              </div>
            </CardContent>
          </Card>
        ))}
        {contas.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Conecte sua primeira conta de marketplace.
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>OmniInbox — mensagens pendentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {mensagensRecentes.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem mensagens pendentes.</div>
          ) : (
            mensagensRecentes.map((m) => (
              <div key={m.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{m.conta.plataforma} · {m.remetente}</span>
                  <span>{formatDateTime(m.recebidaEm)}</span>
                </div>
                <div className="mt-1 text-sm">{m.texto}</div>
                {m.rascunhoIA && (
                  <div className="mt-2 rounded-md bg-accent/10 p-2 text-sm">
                    <strong>Sugestão IA:</strong> {m.rascunhoIA}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
