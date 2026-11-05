import { exigirPerfilPagina } from "@/lib/auth/pagina";
import Link from "next/link";
import { Archive } from "lucide-react";
import { empresaAtualId } from "@/lib/sessao";
import { carregarEstoqueParado } from "@/lib/crm/consultas";
import { centavosParaReais } from "@/lib/crm/dinheiro";
import type { FaixaParado } from "@/lib/crm/estoque-parado";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FAIXAS: FaixaParado[] = [90, 180, 365];
const LIMITE = 300;

export default async function EstoqueParadoPage({ searchParams }: { searchParams: Promise<{ faixa?: string }> }) {
  await exigirPerfilPagina("/relatorios/estoque-parado");
  const sp = await searchParams;
  const faixa = (FAIXAS as number[]).includes(Number(sp.faixa)) ? (Number(sp.faixa) as FaixaParado) : 90;
  const empresaId = await empresaAtualId();
  const { lista, totaisCentavos, quantidades } = await carregarEstoqueParado(empresaId, faixa);
  const totalFiltro = lista.reduce((a, i) => a + i.valorImobilizadoCentavos, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Archive className="h-6 w-6" /> Estoque parado
          </h1>
          <p className="text-muted-foreground">
            Peças com saldo e sem venda concluída há 90, 180 ou 365 dias. Valor pelo custo médio.
          </p>
        </div>
        <Link href="/relatorios" className="text-sm text-accent hover:underline">Todos os relatórios</Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {FAIXAS.map((f) => (
          <Link key={f} href={`/relatorios/estoque-parado?faixa=${f}`} aria-current={f === faixa ? "page" : undefined}
            className={`rounded-lg border p-4 ${f === faixa ? "ring-1 ring-accent" : "hover:bg-secondary"}`}>
            <div className="text-xs text-muted-foreground">{f === 365 ? "1 ano ou mais" : `${f} a ${f === 90 ? 179 : 364} dias`}</div>
            <div className="text-2xl font-bold">{formatBRL(centavosParaReais(totaisCentavos[f]))}</div>
            <div className="text-xs text-muted-foreground">{quantidades[f]} produto(s)</div>
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Produto</th>
                <th className="px-4 py-3 text-right font-medium">Saldo</th>
                <th className="px-4 py-3 font-medium">Última venda</th>
                <th className="px-4 py-3 text-right font-medium">Dias</th>
                <th className="px-4 py-3 text-right font-medium">Parado (R$)</th>
                <th className="px-4 py-3 font-medium">Ação sugerida</th>
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, LIMITE).map((i) => (
                <tr key={i.produtoId} className="border-b align-top">
                  <td className="px-4 py-2">
                    <Link href={`/produtos/${i.produtoId}`} className="font-medium hover:underline">{i.nome}</Link>
                    <div className="text-xs text-muted-foreground">
                      SKU {i.sku}{i.marca && ` · ${i.marca}`}{i.localizacao && ` · ${i.localizacao}`}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{i.estoque.toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-2 text-xs">
                    {i.nuncaVendido ? <Badge variant="outline">nunca vendeu</Badge> : formatDate(i.ultimaVendaEm)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{i.dias}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatBRL(centavosParaReais(i.valorImobilizadoCentavos))}</td>
                  <td className="px-4 py-2 text-xs">{i.acao}</td>
                </tr>
              ))}
              {lista.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhuma peça parada nesta faixa.
                  </td>
                </tr>
              )}
            </tbody>
            {lista.length > 0 && (
              <tfoot>
                <tr className="bg-secondary/50 font-medium">
                  <td className="px-4 py-2" colSpan={4}>{lista.length} produto(s) parados há {faixa} dias ou mais</td>
                  <td className="px-4 py-2 text-right font-mono">{formatBRL(centavosParaReais(totalFiltro))}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
          {lista.length > LIMITE && (
            <p className="border-t px-4 py-3 text-xs text-muted-foreground">Mostrando os {LIMITE} de maior valor parado de {lista.length}.</p>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Só conta venda concluída (paga ou faturada); orçamento e condicional aberta não contam. Peça que nunca vendeu conta a partir da última entrada.
      </p>
    </div>
  );
}
