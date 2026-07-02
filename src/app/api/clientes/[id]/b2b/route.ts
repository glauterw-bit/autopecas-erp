import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { hashSenha } from "@/lib/auth/config";

// Gestão do acesso B2B de um cliente (só GERENTE+).
// PUT: ativa/desativa e/ou define a senha do portal.

const schema = z.object({
  ativo: z.boolean().optional(),
  senha: z.string().min(8, "Senha B2B precisa de ao menos 8 caracteres").optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export const PUT = comAuth<Ctx>("GERENTE", async (req, ctx, usuario) => {
  const { id } = await ctx.params;
  const body = schema.parse(await req.json());

  const cliente = await prisma.cliente.findFirst({
    where: { id, empresaId: usuario.empresaId },
    select: { id: true, b2bAtivo: true, senhaHashB2B: true },
  });
  if (!cliente) throw new ApiError(404, "Cliente não encontrado");

  const data: { b2bAtivo?: boolean; senhaHashB2B?: string } = {};
  if (body.senha) data.senhaHashB2B = hashSenha(body.senha);
  if (body.ativo !== undefined) {
    if (body.ativo && !cliente.senhaHashB2B && !body.senha) {
      throw new ApiError(400, "Defina uma senha antes de ativar o acesso B2B");
    }
    data.b2bAtivo = body.ativo;
  }
  if (Object.keys(data).length === 0) throw new ApiError(400, "Nada para atualizar");

  const atualizado = await prisma.cliente.update({
    where: { id: cliente.id },
    data,
    select: { id: true, nome: true, b2bAtivo: true },
  });
  return NextResponse.json(atualizado);
});
