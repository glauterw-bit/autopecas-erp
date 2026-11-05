import Link from "next/link";
import { ArrowRight, FileScan, PackageSearch, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ComprasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Compras & NF-IA</h1>
        <p className="text-muted-foreground">
          Pedidos a fornecedores, recebimento e NF de entrada via OCR inteligente.
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
            <FileScan className="h-5 w-5 text-accent" /> NF-IA — entrada por OCR
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Em desenvolvimento: o envio por esta tela ainda não funciona. A IA da
            OpenAI vai ler a DANFE (PDF, JPG ou PNG) e trazer cabeçalho, itens,
            NCM, CFOP e alíquotas para você conferir antes da entrada.
          </p>
          <div className="flex flex-col items-center justify-center rounded-md border-2 border-dashed border-border bg-secondary/40 p-12 text-center text-sm text-muted-foreground">
            <Upload className="mb-2 h-8 w-8" />
            Arraste a NF aqui ou clique para escolher
            <Button className="mt-3" variant="accent">Selecionar arquivo</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
