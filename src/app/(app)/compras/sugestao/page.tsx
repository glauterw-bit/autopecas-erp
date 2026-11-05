import { exigirPerfilPagina } from "@/lib/auth/pagina";
import { SugestaoCompra } from "@/components/compras/sugestao-compra";
import { VendasPerdidas } from "@/components/compras/vendas-perdidas";

export const dynamic = "force-dynamic";

// Sugestão de compra + vendas perdidas
// Os dados vêm das APIs autenticadas (/api/compras/sugestao e
// /api/vendas-perdidas) — mesma fonte usada pelo PDV e pelos jobs.

export default async function SugestaoCompraPage() {
  await exigirPerfilPagina("/compras/sugestao");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Sugestão de compra</h1>
        <p className="text-muted-foreground">
          Reposição por ponto de pedido e demanda perdida, agrupada pelo melhor
          fornecedor da grade — gere o pedido em rascunho com um clique.
        </p>
      </div>

      <SugestaoCompra />
      <VendasPerdidas />
    </div>
  );
}
