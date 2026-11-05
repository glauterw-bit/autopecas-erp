import { redirect } from "next/navigation";
import { usuarioDaSessao } from "./config";
import { perfilMinimoDaRota, podePerfil } from "./perfis";

/**
 * Guarda de página (servidor). Chame no começo de cada page.tsx restrita,
 * ANTES de consultar o banco. Sem sessão: vai para o login. Sem permissão:
 * vai para /sem-acesso. Sem argumento de perfil, usa o mapa de rotas.
 */
export async function exigirPerfilPagina(rota: string, perfilMinimo?: string) {
  const u = await usuarioDaSessao();
  if (!u || !u.ativo) redirect("/login");
  if (!podePerfil(u.perfil, perfilMinimo ?? perfilMinimoDaRota(rota))) {
    redirect("/sem-acesso");
  }
  return u;
}
