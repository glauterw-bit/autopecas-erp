import { cookies } from "next/headers";
import { prisma } from "./db";

// Sessão atual (esqueleto)
// ------------------------
// Em produção isto vira NextAuth + JWT. Aqui devolvemos a empresa/usuário
// padrão para que os endpoints possam funcionar contra dados de seed.

const COOKIE = "ap_empresa_id";

export async function empresaAtualId(): Promise<string> {
  const c = await cookies();
  const id = c.get(COOKIE)?.value;
  if (id) return id;
  const primeira = await prisma.empresa.findFirst({ select: { id: true } });
  if (!primeira) throw new Error("Nenhuma empresa cadastrada. Rode o seed.");
  return primeira.id;
}

export async function usuarioAtual(): Promise<{ id: string; empresaId: string; perfil: string }> {
  const empresaId = await empresaAtualId();
  const u = await prisma.usuario.findFirst({
    where: { empresaId, ativo: true },
    select: { id: true, empresaId: true, perfil: true },
  });
  if (!u) throw new Error("Sem usuário válido");
  return u;
}
