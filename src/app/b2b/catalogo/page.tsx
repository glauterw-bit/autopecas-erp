import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { clienteAtualB2B } from "@/lib/b2b/sessao";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CatalogoB2B(props: {
  searchParams: Promise<{ q?: string }>;
}) {
  const cliente = await clienteAtualB2B();
  if (!cliente) redirect("/b2b/login");
  const { q } = await props.searchParams;
  const termo = q?.trim();

  const produtos = await prisma.produto.findMany({
    where: {
      empresaId: cliente.empresaId,
      ativo: true,
      ...(termo && {
        OR: [
          { nome: { contains: termo, mode: "insensitive" } },
          { codigoOem: termo },
          { codigoFabricante: termo },
          { codigoBarras: termo },
        ],
      }),
    },
    include: { marca: true, estoques: true, precos: { where: { tabelaId: cliente.tabelaPrecoId ?? "" } } },
    take: 60,
    orderBy: { nome: "asc" },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Catálogo</h1>
        <p className="text-sm text-muted-foreground">
          {cliente.tabelaPreco
            ? `Preços da tabela: ${cliente.tabelaPreco.nome}`
            : "Preços padrão da loja"}
        </p>
      </div>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={termo}
          placeholder="SKU, OEM, fabricante ou descrição"
          className="h-10 flex-1 rounded-md border bg-background px-3 text-sm"
        />
        <button className="rounded-md bg-accent px-4 text-sm font-medium text-white">
          Buscar
        </button>
      </form>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {produtos.map((p) => {
          const preco = p.precos[0] ? Number(p.precos[0].preco) : Number(p.precoVenda);
          const estoque = p.estoques.reduce(
            (a, e) => a + Number(e.quantidade) - Number(e.reservado),
            0,
          );
          return (
            <Card key={p.id}>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">SKU {p.sku}</div>
                <div className="line-clamp-2 text-sm font-medium">{p.nome}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  {p.marca && <Badge variant="muted">{p.marca.nome}</Badge>}
                  <span>{estoque > 0 ? `${estoque} em estoque` : "sob encomenda"}</span>
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <div className="text-lg font-bold">{formatBRL(preco)}</div>
                  <button className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white">
                    Adicionar
                  </button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {produtos.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Nenhum produto encontrado.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
