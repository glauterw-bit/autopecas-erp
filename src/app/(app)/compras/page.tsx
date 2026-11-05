import { exigirPerfilPagina } from "@/lib/auth/pagina";
import Link from "next/link";
import { ArrowRight, FileScan, PackageSearch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EntradaXml } from "@/components/compras/entrada-xml";

export default async function ComprasPage() {
  await exigirPerfilPagina("/compras");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Compras</h1>
        <p className="text-muted-foreground">
          Sugestão de compra e entrada de nota dos fornecedores.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackageSearch className="h-5 w-5 text-accent" /> Sugestão de compra & vendas perdidas
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Reposição por ponto de pedido e demanda perdida, agrupada por
            fornecedor — gere pedidos em rascunho com um clique.
          </p>
          <Button asChild variant="outline">
            <Link href="/compras/sugestao">
              Abrir sugestão <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileScan className="h-5 w-5 text-accent" /> Entrada de nota de compra (XML)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Envie o XML que o fornecedor mandou. Você confere os itens antes; só depois a nota entra no estoque e o
            custo médio é atualizado. Leitura de PDF e foto ainda não existe.
          </p>
          <EntradaXml />
        </CardContent>
      </Card>
    </div>
  );
}
