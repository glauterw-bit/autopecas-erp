import { FileScan, Upload } from "lucide-react";
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
            <FileScan className="h-5 w-5 text-accent" /> NF-IA — entrada por OCR
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Solte a DANFE (PDF, JPG ou PNG) abaixo. A IA Claude extrai cabeçalho,
            itens, NCM, CFOP, alíquotas e sugere o preço de venda com base na
            margem-alvo de cada produto.
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
