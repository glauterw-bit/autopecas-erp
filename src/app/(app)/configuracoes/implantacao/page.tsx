import { usuarioAtual } from "@/lib/sessao";
import { podePerfil } from "@/lib/auth/config";
import { Importador } from "./importador";

export const dynamic = "force-dynamic";

export default async function ImplantacaoPage() {
  const u = await usuarioAtual();
  if (!podePerfil(u.perfil, "ADMIN")) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Implantação</h1>
        <p className="text-muted-foreground">Só o administrador da loja pode importar dados.</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Implantação</h1>
        <p className="text-muted-foreground">
          Traga os dados do sistema antigo por planilha (CSV). Sempre simule antes de aplicar. Rodar de novo o mesmo
          arquivo não duplica nada.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ordem: fornecedores → produtos → preços → estoque → clientes → contas a receber. Passo a passo completo em
          docs/IMPLANTACAO.md.
        </p>
      </div>
      <Importador />
    </div>
  );
}
