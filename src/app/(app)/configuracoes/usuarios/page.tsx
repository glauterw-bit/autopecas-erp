import { exigirPerfilPagina } from "@/lib/auth/pagina";
import { UsuariosClient } from "./usuarios-client";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const u = await exigirPerfilPagina("/configuracoes/usuarios");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Usuários</h1>
        <p className="text-muted-foreground">
          Convide pessoas, mude o perfil, desative quem saiu e gere o link para quem esqueceu a senha.
        </p>
      </div>
      <UsuariosClient meuId={u.id} />
    </div>
  );
}
