import type { PrismaClient } from "@prisma/client";
import { TERMOS_VERSAO } from "./versao";

export const DOCUMENTOS_LEGAIS = ["TERMOS", "PRIVACIDADE", "DPA"] as const;

type Quem = { usuarioId: string; empresaId: string; ip?: string | null; userAgent?: string | null };

/** Registra o aceite dos três documentos na versão vigente. Repetir não duplica. */
export async function registrarAceite(db: Pick<PrismaClient, "aceiteTermos">, q: Quem, versao = TERMOS_VERSAO) {
  await db.aceiteTermos.createMany({
    data: DOCUMENTOS_LEGAIS.map((documento) => ({
      usuarioId: q.usuarioId,
      empresaId: q.empresaId,
      documento,
      versao,
      ip: q.ip ?? null,
      userAgent: q.userAgent?.slice(0, 300) ?? null,
    })),
    skipDuplicates: true,
  });
}

/** Há versão mais nova dos termos que este usuário ainda não aceitou? */
export async function aceitePendente(db: Pick<PrismaClient, "aceiteTermos">, usuarioId: string, versao = TERMOS_VERSAO) {
  const n = await db.aceiteTermos.count({ where: { usuarioId, documento: "TERMOS", versao } });
  return n === 0;
}
