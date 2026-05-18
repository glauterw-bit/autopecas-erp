import { BarChart3 } from "lucide-react";

export default function RelatoriosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Relatórios</h1>
        <p className="text-muted-foreground">
          DRE, fluxo de caixa, curva ABC, vendedores, marketplaces.
        </p>
      </div>
      <div className="flex h-60 items-center justify-center rounded-md border border-dashed text-muted-foreground">
        <BarChart3 className="mr-2 h-5 w-5" /> Em construção
      </div>
    </div>
  );
}
