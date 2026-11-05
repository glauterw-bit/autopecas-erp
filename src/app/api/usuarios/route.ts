import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, comAuth } from "@/lib/auth/guard";
import { criarTokenConta, urlDoLink } from "@/lib/auth/contas";
import { SENHA_PENDENTE } from "@/lib/auth/token";
import { registrarAuditoria } from "@/lib/auth/auditoria";
import { Prisma } from "@prisma/client";

// Usuários da empresa (só ADMIN).
// GET  → lista
// POST → convida: cria o usuário sem senha e devolve o link de uso único
//        (vale 72 h). O ADMIN entrega o link; a senha nunca passa por aqui.
const PERFIS = ["ADMIN", "GERENTE", "FINANCEIRO", "VENDEDOR", "CAIXA", "ESTOQUISTA", "TECNICO"] as const;

const conviteSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  perfil: z.enum(PERFIS),
});

export const GET = comAuth("ADMIN", async (_req, _ctx, usuario) => {
  const lista = await prisma.usuario.findMany({
    where: { empresaId: usuario.empresaId },
    select: {
      id: true, nome: true, email: true, perfil: true, ativo: true, ultimoLogin: true,
      senhaHash: true, totpSecret: true,
    },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
  });
  return NextResponse.json(
    lista.map(({ senhaHash, totpSecret, ...u }) => ({
      ...u,
      convitePendente: senhaHash === SENHA_PENDENTE,
      doisFatores: !!totpSecret,
    })),
  );
});

export const POST = comAuth("ADMIN", async (req, _ctx, usuario) => {
  const body = conviteSchema.parse(await req.json());
  try {
    const out = await prisma.$transaction(async (tx) => {
      const novo = await tx.usuario.create({
        data: {
          empresaId: usuario.empresaId,
          nome: body.nome,
          email: body.email,
          perfil: body.perfil,
          senhaHash: SENHA_PENDENTE,
        },
        select: { id: true, nome: true, email: true, perfil: true },
      });
      const { token, expiraEm } = await criarTokenConta(tx, {
        usuarioId: novo.id,
        tipo: "CONVITE",
        criadoPorId: usuario.id,
      });
      await registrarAuditoria(tx, {
        empresaId: usuario.empresaId,
        usuarioId: usuario.id,
        acao: "USUARIO_CONVIDADO",
        entidade: "Usuario",
        entidadeId: novo.id,
        depois: { email: novo.email, perfil: novo.perfil },
      });
      return { novo, token, expiraEm };
    });
    return NextResponse.json(
      {
        usuario: out.novo,
        link: urlDoLink("/redefinir-senha", out.token, new URL(req.url).origin),
        expiraEm: out.expiraEm,
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ApiError(409, "Já existe um usuário com este e-mail.");
    }
    throw e;
  }
});
