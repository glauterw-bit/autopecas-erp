import { redirect } from "next/navigation";
import { usuarioDaSessao } from "./config";
import { perfilMinimoDaRota, podePerfil } from "./perfis";
import { acessoDaEmpresa } from "../assinatura/politica";
import { moduloDaPagina, moduloLiberado } from "../assinatura/estado";

/**
 * Guarda de página (servidor). Chame no começo de cada page.tsx restrita,
 * ANTES de consultar o banco. Sem sessão: vai para o login. Sem permissão:
 * vai para /sem-acesso. Sem argumento de perfil, usa o mapa de rotas.
 * Também aplica o plano: conta suspensa só vê a tela de assinatura, e módulo
 * fora do plano mostra a explicação com o botão de mudar de plano.
 */
export async function exigirPerfilPagina(rota: string, perfilMinimo?: string) {
  const u = await usuarioDaSessao();
  if (!u || !u.ativo) redirect("/login");
  if (!podePerfil(u.perfil, perfilMinimo ?? perfilMinimoDaRota(rota))) {
    redirect("/sem-acesso");
  }
  let acesso: Awaited<ReturnType<typeof acessoDaEmpresa>> | null = null;
  try {
    acesso = await acessoDaEmpresa(u.empresaId);
  } catch (e) {
    console.error("[assinatura] falha ao ler a assinatura na página; liberando", (e as Error).message);
  }
  if (acesso) {
    if (acesso.modo === "SUSPENSO" && !rota.startsWith("/configuracoes/assinatura")) {
      redirect("/configuracoes/assinatura");
    }
    const modulo = moduloDaPagina(rota);
    if (modulo && acesso.assinatura && !moduloLiberado(acesso.assinatura.plano, modulo)) {
      redirect(`/sem-acesso?motivo=plano&modulo=${modulo}`);
    }
  }
  return u;
}
