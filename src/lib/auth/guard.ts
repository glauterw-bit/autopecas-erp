import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "../db";
import { usuarioDaSessao, podePerfil } from "./config";
import { comRequestId, novoRequestId, registrarErro, requestIdAtual } from "../observabilidade";

// Guard central das rotas de API
// ==============================
// Toda rota autenticada usa comAuth(perfilMinimo, handler):
// - valida a sessão (cookie ap_auth → SessaoAuth no banco)
// - aplica RBAC pela hierarquia de perfis
// - injeta o usuário (com empresaId do próprio usuário — nunca de cookie solto)
// - sanitiza erros: nada de stack do Prisma vazando pro cliente

export class ApiError extends Error {
  constructor(public status: number, message: string) {
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
    const requestId = novoRequestId();
    return comRequestId(requestId, async () => {
      let res: Response;
      let empresaId: string | undefined;
      try {
        const usuario = await exigirSessao(perfilMinimo ?? undefined);
        empresaId = usuario.empresaId;
        res = await handler(req, ctx, usuario);
      } catch (e) {
        res = respostaErro(e, { rota: req.nextUrl?.pathname, empresaId });
      }
      try { res.headers.set("x-request-id", requestId); } catch { /* resposta imutável */ }
      return res;
    });
  };
}

export function respostaErro(e: unknown, ctx: { rota?: string; empresaId?: string } = {}): NextResponse {
  if (e instanceof ApiError) {
    return NextResponse.json({ erro: e.message }, { status: e.status });
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
  if (negocio && msg) {
    if (!(e instanceof Error) || e.constructor !== Error) registrarErro(e, { ...ctx, nivel: "warning" });
    return NextResponse.json({ erro: msg }, { status: 400 });
  }
  const requestId = requestIdAtual() ?? novoRequestId();
  registrarErro(e, { ...ctx, requestId });
  return NextResponse.json(
    { erro: `Erro interno. Informe o código ${requestId} ao suporte.`, requestId },
    { status: 500, headers: { "x-request-id": requestId } },
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
