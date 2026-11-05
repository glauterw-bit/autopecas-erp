import { exigirPerfilPagina } from "@/lib/auth/pagina";
import { ContaClient } from "./conta-client";

export const dynamic = "force-dynamic";

export default async function ContaPage() {
  const u = await exigirPerfilPagina("/conta");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Minha conta</h1>
        <p className="text-muted-foreground">
          {u.nome} · {u.email} · perfil {u.perfil.toLowerCase()}
        </p>
      </div>
      <ContaClient />
    </div>
  );
}
