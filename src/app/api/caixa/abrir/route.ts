import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { sessaoAbertaDoUsuario, serializarSessao } from "../_lib";

// POST /api/caixa/abrir — abre uma sessão de caixa pro usuário logado.
// Provisiona Filial "Matriz" e Caixa "Caixa 01" caso a empresa ainda não tenha.

const schema = z.object({
  valorAbertura: z
    .number({ message: "valorAbertura deve ser um número" })
    .min(0, "Valor de abertura não pode ser negativo")
    .finite(),
});

export const POST = comAuth("CAIXA", async (req, _ctx, usuario) => {
  const { valorAbertura } = schema.parse(await req.json());

  const jaAberta = await sessaoAbertaDoUsuario(usuario);
  if (jaAberta) throw new ApiError(400, "Você já tem uma sessão de caixa aberta");

  // Filial da empresa (cria "Matriz" se não existir)
  let filial = await prisma.filial.findFirst({
    where: { empresaId: usuario.empresaId },
    orderBy: { criadoEm: "asc" },
    select: { id: true },
  });
  if (!filial) {
    filial = await prisma.filial.create({
      data: { empresaId: usuario.empresaId, nome: "Matriz" },
      select: { id: true },
    });
  }

  // Caixa da empresa (cria "Caixa 01" se não existir)
  let caixa = await prisma.caixa.findFirst({
    where: { ativo: true, filial: { empresaId: usuario.empresaId } },
    select: { id: true },
  });
  if (!caixa) {
    caixa = await prisma.caixa.create({
      data: { filialId: filial.id, nome: "Caixa 01" },
      select: { id: true },
    });
  }

  await prisma.sessaoCaixa.create({
    data: { caixaId: caixa.id, usuarioId: usuario.id, valorAbertura },
  });

  const sessao = await sessaoAbertaDoUsuario(usuario);
  return NextResponse.json({ sessao: serializarSessao(sessao!) }, { status: 201 });
});
