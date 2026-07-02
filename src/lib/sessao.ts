import { usuarioDaSessao } from "./auth/config";
import { ApiError } from "./auth/guard";

// Sessão atual
// ------------
// O tenant (empresaId) SEMPRE vem do usuário autenticado — nunca de cookie
// avulso nem de fallback "primeira empresa do banco". Sem sessão válida,
// as rotas devolvem 401 e as páginas redirecionam pro /login (ver layout).

export async function empresaAtualId(): Promise<string> {
  const u = await usuarioDaSessao();
  if (!u || !u.ativo) throw new ApiError(401, "Não autenticado");
  return u.empresaId;
}

export async function usuarioAtual(): Promise<{ id: string; empresaId: string; perfil: string }> {
  const u = await usuarioDaSessao();
  if (!u || !u.ativo) throw new ApiError(401, "Não autenticado");
  return { id: u.id, empresaId: u.empresaId, perfil: u.perfil };
}
