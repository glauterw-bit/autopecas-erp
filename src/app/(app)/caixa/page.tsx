import { exigirPerfilPagina } from "@/lib/auth/pagina";
import { CaixaClient } from "@/components/caixa/caixa-client";

export const dynamic = "force-dynamic";

// Gestão de caixa do PDV: abertura, sangria/suprimento e fechamento cego.
// Todo o estado vem de /api/caixa (sempre com ?cego=1 — o esperado só aparece
// depois que o operador informa o valor contado).

export default async function CaixaPage() {
  await exigirPerfilPagina("/caixa");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Caixa</h1>
        <p className="text-muted-foreground">
          Abertura, sangrias, suprimentos e fechamento cego da sessão de caixa.
        </p>
      </div>
      <CaixaClient />
    </div>
  );
}
