import { exigirPerfilPagina } from "@/lib/auth/pagina";
import { AssinaturaClient } from "./assinatura-client";

export const dynamic = "force-dynamic";

export default async function AssinaturaPage() {
  await exigirPerfilPagina("/configuracoes/assinatura", "ADMIN");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Assinatura</h1>
        <p className="text-muted-foreground">Seu plano, suas faturas e o uso do mês. Cancelar não apaga nenhum dado.</p>
      </div>
      <AssinaturaClient />
    </div>
  );
}
