"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, PackageSearch, RefreshCw, ShoppingCart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/utils";

// Sugestão de compra agrupada por fornecedor.
// Consome GET /api/compras/sugestao e gera pedido RASCUNHO por grupo via POST.

type ProdutoResumo = { id: string; sku: string; nome: string };
type ItemSugestao = {
  produto: ProdutoResumo;
  estoqueTotal: number;
  sugerida: number;
  precoCompra: number;
  subtotal: number;
};
type GrupoFornecedor = {
  fornecedor: { id: string; nome: string; prazoEntregaDias: number };
  itens: ItemSugestao[];
  total: number;
};
type ItemSemFornecedor = Omit<ItemSugestao, "precoCompra" | "subtotal">;
type RespostaSugestao = {
  grupos: GrupoFornecedor[];
  semFornecedor: { itens: ItemSemFornecedor[] };
  geradoEm: string;
};

export function SugestaoCompra() {
  const [dados, setDados] = useState<RespostaSugestao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState<string | null>(null);
  const [pedidosGerados, setPedidosGerados] = useState<Record<string, number>>({});

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/compras/sugestao");
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro ?? "Falha ao carregar sugestão");
      setDados(json);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function gerarPedido(grupo: GrupoFornecedor) {
    setGerando(grupo.fornecedor.id);
    setErro(null);
    try {
      const res = await fetch("/api/compras/sugestao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornecedorId: grupo.fornecedor.id,
          itens: grupo.itens.map((i) => ({
            produtoId: i.produto.id,
            quantidade: i.sugerida,
            precoUnitario: i.precoCompra,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro ?? "Falha ao gerar pedido");
      setPedidosGerados((p) => ({ ...p, [grupo.fornecedor.id]: json.numero }));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setGerando(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <PackageSearch className="h-5 w-5 text-accent" /> Sugestão de compra
          </span>
          <Button size="sm" variant="outline" onClick={carregar} disabled={carregando}>
            <RefreshCw className={`mr-2 h-3 w-3 ${carregando ? "animate-spin" : ""}`} />
            Recalcular
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Produtos no ponto de reposição ou com venda perdida por falta de estoque
          nos últimos 30 dias, agrupados pelo melhor fornecedor da grade.
        </p>

        {erro && <p className="text-sm text-red-500">{erro}</p>}
        {carregando && !dados && (
          <p className="text-sm text-muted-foreground">Calculando sugestão…</p>
        )}

        {dados && dados.grupos.length === 0 && dados.semFornecedor.itens.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum produto precisa de reposição agora.
          </p>
        )}

        {dados?.grupos.map((grupo) => {
          const numeroPedido = pedidosGerados[grupo.fornecedor.id];
          return (
            <div key={grupo.fornecedor.id} className="rounded-md border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{grupo.fornecedor.nome}</span>
                  <Badge variant="outline">
                    prazo {grupo.fornecedor.prazoEntregaDias} dias
                  </Badge>
                  <Badge variant="muted">
                    {grupo.itens.length} {grupo.itens.length === 1 ? "item" : "itens"}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{formatBRL(grupo.total)}</span>
                  {numeroPedido ? (
                    <Badge variant="success">Pedido #{numeroPedido} criado</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="accent"
                      onClick={() => gerarPedido(grupo)}
                      disabled={gerando !== null}
                    >
                      <ShoppingCart className="mr-2 h-3 w-3" />
                      {gerando === grupo.fornecedor.id ? "Gerando…" : "Gerar pedido"}
                    </Button>
                  )}
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">SKU</th>
                    <th className="px-4 py-2 font-medium">Produto</th>
                    <th className="px-4 py-2 text-right font-medium">Estoque</th>
                    <th className="px-4 py-2 text-right font-medium">Sugerida</th>
                    <th className="px-4 py-2 text-right font-medium">Preço compra</th>
                    <th className="px-4 py-2 text-right font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.itens.map((item) => (
                    <tr key={item.produto.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-mono text-xs">{item.produto.sku}</td>
                      <td className="px-4 py-2">{item.produto.nome}</td>
                      <td className="px-4 py-2 text-right">{item.estoqueTotal}</td>
                      <td className="px-4 py-2 text-right font-medium">{item.sugerida}</td>
                      <td className="px-4 py-2 text-right">{formatBRL(item.precoCompra)}</td>
                      <td className="px-4 py-2 text-right">{formatBRL(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        {dados && dados.semFornecedor.itens.length > 0 && (
          <div className="rounded-md border border-amber-500/40">
            <div className="flex items-center gap-2 border-b bg-amber-500/10 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="font-medium">Sem fornecedor na grade</span>
              <Badge variant="warning">{dados.semFornecedor.itens.length}</Badge>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">SKU</th>
                  <th className="px-4 py-2 font-medium">Produto</th>
                  <th className="px-4 py-2 text-right font-medium">Estoque</th>
                  <th className="px-4 py-2 text-right font-medium">Sugerida</th>
                </tr>
              </thead>
              <tbody>
                {dados.semFornecedor.itens.map((item) => (
                  <tr key={item.produto.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{item.produto.sku}</td>
                    <td className="px-4 py-2">{item.produto.nome}</td>
                    <td className="px-4 py-2 text-right">{item.estoqueTotal}</td>
                    <td className="px-4 py-2 text-right font-medium">{item.sugerida}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-2 text-xs text-muted-foreground">
              Cadastre um fornecedor na grade destes produtos para incluí-los na cotação.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
