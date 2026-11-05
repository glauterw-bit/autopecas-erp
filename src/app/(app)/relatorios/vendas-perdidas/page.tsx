import Link from "next/link";
import { PackageX } from "lucide-react";
import { empresaAtualId } from "@/lib/sessao";
import { carregarVendasPerdidas } from "@/lib/crm/consultas";
import { ROTULO_MOTIVO_PERDA, MOTIVOS_VENDA_PERDIDA, type MotivoVendaPerdida } from "@/lib/crm/vendas-perdidas";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PERIODOS = [7, 30, 90, 180];

export default async function VendasPerdidasPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string; motivo?: string }>;
}) {
  const sp = await searchParams;
  const dias = PERIODOS.includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const motivo = (MOTIVOS_VENDA_PERDIDA as readonly string[]).includes(sp.motivo ?? "")
    ? (sp.motivo as MotivoVendaPerdida)
    : null;
  const empresaId = await empresaAtualId();
  const { total, porMotivo, grupos } = await carregarVendasPerdidas(empresaId, dias);
  const lista = motivo ? grupos.filter((g) => g.porMotivo[motivo] > 0) : grupos;
  const href = (d: number, m: string | null) => `/relatorios/vendas-perdidas?dias=${d}${m ? `&motivo=${m}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <PackageX className="h-6 w-6" /> Vendas perdidas
          </h1>
          <p className="text-muted-foreground">
            O que o cliente pediu e a loja não vendeu, por peça e motivo. Registre no PDV com F8.
          </p>
        </div>
        <Link href="/relatorios" className="text-sm text-accent hover:underline">Todos os relatórios</Link>
      </div>

      <nav aria-label="Período" className="flex flex-wrap gap-2 text-sm">
        {PERIODOS.map((d) => (
          <Link key={d} href={href(d, motivo)} aria-current={d === dias ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${d === dias ? "border-accent bg-accent text-white" : "hover:bg-secondary"}`}>
            {d} dias
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Link href={href(dias, null)} className={`rounded-lg border p-3 ${!motivo ? "ring-1 ring-accent" : "hover:bg-secondary"}`}>
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-2xl font-bold">{total}</div>
        </Link>
        {MOTIVOS_VENDA_PERDIDA.map((m) => (
          <Link key={m} href={href(dias, m)} className={`rounded-lg border p-3 ${motivo === m ? "ring-1 ring-accent" : "hover:bg-secondary"}`}>
            <div className="text-xs text-muted-foreground">{ROTULO_MOTIVO_PERDA[m]}</div>
            <div className="text-2xl font-bold">{porMotivo[m]}</div>
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Peça pedida</th>
                <th className="px-4 py-3 text-right font-medium">Vezes</th>
                <th className="px-4 py-3 text-right font-medium">Qtd</th>
                <th className="px-4 py-3 font-medium">Motivos</th>
                <th className="px-4 py-3 font-medium">Última</th>
                <th className="px-4 py-3 font-medium">Sugestão</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((g) => (
                <tr key={g.chave} className="border-b align-top">
                  <td className="px-4 py-2">
                    {g.produtoId ? (
                      <Link href={`/produtos/${g.produtoId}`} className="font-medium hover:underline">{g.descricao}</Link>
                    ) : (
                      <span className="font-medium">{g.descricao}</span>
                    )}
                    {!g.produtoId && <div className="text-xs text-muted-foreground">não cadastrado</div>}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{g.ocorrencias}</td>
                  <td className="px-4 py-2 text-right font-mono">{g.quantidade.toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {MOTIVOS_VENDA_PERDIDA.filter((m) => g.porMotivo[m] > 0).map((m) => (
                        <Badge key={m} variant="outline">{ROTULO_MOTIVO_PERDA[m]} {g.porMotivo[m].toLocaleString("pt-BR")}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{formatDate(g.ultima)}</td>
                  <td className="px-4 py-2 text-xs">
                    <span className={g.comprarQtd > 0 ? "font-semibold text-accent" : ""}>{g.sugestao}</span>
                  </td>
                </tr>
              ))}
              {lista.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhuma venda perdida registrada no período. No PDV, aperte F8 quando faltar uma peça.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Sugestão de compra = quantidade perdida por falta ou prazo + estoque mínimo − saldo atual. É sugestão: quem compra decide.
      </p>
    </div>
  );
}
