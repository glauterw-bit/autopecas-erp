import type { Prisma, PrismaClient } from "@prisma/client";
import { gerarToken, hashToken, validadeMs, type TipoToken } from "./token";

type Db = PrismaClient | Prisma.TransactionClient;

/** Cria um link de uso único. Os links anteriores do mesmo tipo, ainda não usados, deixam de valer. */
export async function criarTokenConta(
  db: Db,
  dados: { usuarioId: string; tipo: TipoToken; criadoPorId?: string | null },
) {
  const token = gerarToken();
  const expiraEm = new Date(Date.now() + validadeMs(dados.tipo));
  await db.tokenConta.updateMany({
    where: { usuarioId: dados.usuarioId, tipo: dados.tipo, usadoEm: null },
    data: { usadoEm: new Date() },
  });
  await db.tokenConta.create({
    data: {
      usuarioId: dados.usuarioId,
      tipo: dados.tipo,
      tokenHash: hashToken(token),
      expiraEm,
      criadoPorId: dados.criadoPorId ?? null,
    },
  });
  return { token, expiraEm };
}

/**
 * Consome o token de forma atômica (só um uso, mesmo com duas chamadas ao
 * mesmo tempo). Devolve o usuário dono, ou null se inválido, usado ou vencido.
 */
export async function consumirTokenConta(db: Db, token: string, tipos: TipoToken[]) {
  const hash = hashToken(token);
  const agora = new Date();
  const r = await db.tokenConta.updateMany({
    where: { tokenHash: hash, tipo: { in: tipos }, usadoEm: null, expiraEm: { gt: agora } },
    data: { usadoEm: agora },
  });
  if (r.count !== 1) return null;
  const t = await db.tokenConta.findUnique({
    where: { tokenHash: hash },
    select: { usuarioId: true, tipo: true },
  });
  return t;
}

export function urlDoLink(caminho: string, token: string, origemReq?: string): string {
  const base = (process.env.APP_URL || origemReq || "").replace(/\/+$/, "");
  return `${base}${caminho}?token=${encodeURIComponent(token)}`;
}
