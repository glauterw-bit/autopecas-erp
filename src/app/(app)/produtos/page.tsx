import { exigirPerfilPagina } from "@/lib/auth/pagina";
import Link from "next/link";
import { BadgeCheck, Plus, ShieldCheck, Wrench } from "lucide-react";
import { prisma } from "@/lib/db";
import { empresaAtualId } from "@/lib/sessao";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProdutosPage() {
  await exigirPerfilPagina("/produtos");
  const empresaId = await empresaAtualId();
  const produtos = await prisma.produto.findMany({
    where: { empresaId, ativo: true },
    include: { marca: true, categoria: true, estoques: true },
    orderBy: { atualizadoEm: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Produtos</h1>
          <p className="text-muted-foreground">
            Catálogo da loja com aplicação veicular, cross-reference e curva ABC.
          </p>
        </div>
        <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link href="/produtos/qualidade">
            <ShieldCheck className="h-4 w-4" /> Qualidade do cadastro
          </Link>
        </Button>
        <Button asChild>
          <Link href="/produtos/novo">
            <Plus className="h-4 w-4" /> Novo produto
          </Link>
        </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary text-left">
              <tr>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Produto</th>
                <th className="px-4 py-3 font-medium">Marca</th>
                <th className="px-4 py-3 font-medium">Curva</th>
                <th className="px-4 py-3 text-right font-medium">Estoque</th>
                <th className="px-4 py-3 text-right font-medium">Custo</th>
                <th className="px-4 py-3 text-right font-medium">Venda</th>
                <th className="px-4 py-3 text-right font-medium">Margem</th>
              </tr>
            </thead>
            <tbody>
              {produtos.map((p) => {
                const estoque = p.estoques.reduce(
                  (a, e) => a + Number(e.quantidade) - Number(e.reservado),
                  0,
                );
                const custo = Number(p.custoMedio);
                const venda = Number(p.precoVenda);
                const margem = venda > 0 ? ((venda - custo) / venda) * 100 : 0;
                return (
                  <tr key={p.id} className="border-b hover:bg-secondary/50">
                    <td className="px-4 py-2 font-mono text-xs">{p.sku}</td>
                    <td className="px-4 py-2">
                      <Link href={`/produtos/${p.id}`} className="font-medium hover:underline">{p.nome}</Link>
                      {p.aplicacaoVerificadaEm && (
                        <BadgeCheck className="ml-1 inline h-3.5 w-3.5 text-emerald-600" aria-label="Aplicação verificada" />
                      )}
                      {p.revisaoCadastro && (
                        <Wrench className="ml-1 inline h-3.5 w-3.5 text-amber-600" aria-label="Cadastro em revisão" />
                      )}
                      <div className="text-xs text-muted-foreground">
                        {p.codigoOem && `OEM ${p.codigoOem}`}
                        {p.codigoFabricante && ` · Fab ${p.codigoFabricante}`}
                      </div>
                    </td>
                    <td className="px-4 py-2">{p.marca?.nome ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Badge variant={p.curva === "A" ? "accent" : p.curva === "B" ? "muted" : "outline"}>
                        {p.curva}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{estoque}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatBRL(custo)}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatBRL(venda)}</td>
                    <td className="px-4 py-2 text-right">
                      <Badge variant={margem >= 25 ? "success" : margem >= 10 ? "warning" : "destructive"}>
                        {margem.toFixed(1)}%
                      </Badge>
                    </td>
                  </tr>
                );
              })}
              {produtos.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhum produto cadastrado ainda. Use "Novo produto" para começar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
