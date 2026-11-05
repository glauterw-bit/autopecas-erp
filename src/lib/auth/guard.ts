import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "../db";
import { usuarioDaSessao, podePerfil } from "./config";
import { aplicarPoliticaAssinatura } from "../assinatura/politica";

// Guard central das rotas de API
// ==============================
// Toda rota autenticada usa comAuth(perfilMinimo, handler):
// - valida a sessão (cookie ap_auth → SessaoAuth no banco)
// - aplica RBAC pela hierarquia de perfis
// - injeta o usuário (com empresaId do próprio usuário — nunca de cookie solto)
// - sanitiza erros: nada de stack do Prisma vazando pro cliente

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public codigo?: string,
  ) {
    super(message);
  }
}

export type UsuarioSessao = {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  ativo: boolean;
  empresaId: string;
  permissoes: string[];
};

export async function exigirSessao(perfilMinimo?: string): Promise<UsuarioSessao> {
  const u = await usuarioDaSessao();
  if (!u || !u.ativo) throw new ApiError(401, "Não autenticado");
  if (perfilMinimo && !podePerfil(u.perfil, perfilMinimo)) {
    throw new ApiError(403, "Sem permissão para esta operação");
  }
  return u as UsuarioSessao;
}

type Handler<C> = (req: NextRequest, ctx: C, usuario: UsuarioSessao) => Promise<Response>;

export function comAuth<C = unknown>(perfilMinimo: string | null, handler: Handler<C>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    try {
      const usuario = await exigirSessao(perfilMinimo ?? undefined);
      // Plano e pagamento (módulo fora do plano, somente leitura, suspensão).
      await aplicarPoliticaAssinatura(req, usuario.empresaId);
      return await handler(req, ctx, usuario);
    } catch (e) {
      return respostaErro(e);
    }
  };
}

export function respostaErro(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    return NextResponse.json(
      e.codigo ? { erro: e.message, codigo: e.codigo } : { erro: e.message },
      { status: e.status },
    );
  }
  if (e instanceof ZodError) {
    const detalhe = e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return NextResponse.json({ erro: `Dados inválidos: ${detalhe}` }, { status: 400 });
  }
  // Erros de regra de negócio lançados como Error simples continuam legíveis,
  // mas erros de infraestrutura (Prisma etc.) não vazam detalhes.
  const msg = (e as Error).message ?? "";
  const negocio =
    msg.length < 160 && !/prisma|invocation|constraint|connect|ECONN|timeout/i.test(msg);
  console.error("[api]", e);
  return NextResponse.json(
    { erro: negocio && msg ? msg : "Erro interno" },
    { status: negocio ? 400 : 500 },
  );
}

// --- Integrações máquina-a-máquina (Vallente Hub etc.) -------------------
// Autentica pela X-API-Key da empresa; não usa cookie de sessão.
export async function empresaPorApiKey(req: NextRequest) {
  const key =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!key || key.length < 32) throw new ApiError(401, "API key ausente");
  const empresa = await prisma.empresa.findFirst({
    where: { vallenteApiKey: key },
    select: { id: true, razaoSocial: true },
  });
  if (!empresa) throw new ApiError(401, "API key inválida");
  return empresa;
}
