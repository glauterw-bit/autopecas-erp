import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { registrarAuditoria } from "@/lib/crm/auditoria";
import { validarSelo } from "@/lib/crm/qualidade-cadastro";

// Selo "aplicação verificada" e revisão de cadastro
// =================================================
// POST (ESTOQUISTA) { acao }:
//   "verificar"        → selo com quem e quando (exige ≥ 1 aplicação);
//                        também conclui a revisão pendente, se houver.
//   "remover_selo"     → tira o selo.
//   "marcar_revisao"   → marca para revisão (motivo obrigatório).
//   "concluir_revisao" → tira a marca de revisão (cadastro corrigido).
// Toda ação grava LogAuditoria com antes e depois.

type Ctx = { params: Promise<{ id: string }> };

const schema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("verificar") }),
  z.object({ acao: z.literal("remover_selo") }),
  z.object({ acao: z.literal("marcar_revisao"), motivo: z.string().trim().min(3, "Diga o que está errado").max(300) }),
  z.object({ acao: z.literal("concluir_revisao") }),
]);

export const POST = comAuth<Ctx>("ESTOQUISTA", async (req, ctx, usuario) => {
  const { id } = await ctx.params;
  const body = schema.parse(await req.json());
  const p = await prisma.produto.findFirst({
    where: { id, empresaId: usuario.empresaId },
    select: {
      id: true,
      aplicacaoVerificadaEm: true,
      aplicacaoVerificadaPorNome: true,
      revisaoCadastro: true,
      revisaoCadastroMotivo: true,
      _count: { select: { aplicacoes: true } },
    },
  });
  if (!p) throw new ApiError(404, "Produto não encontrado");
  const antes = {
    aplicacaoVerificadaEm: p.aplicacaoVerificadaEm,
    aplicacaoVerificadaPorNome: p.aplicacaoVerificadaPorNome,
    revisaoCadastro: p.revisaoCadastro,
    revisaoCadastroMotivo: p.revisaoCadastroMotivo,
  };

  let data: Parameters<typeof prisma.produto.update>[0]["data"];
  if (body.acao === "verificar") {
    const erro = validarSelo(p._count.aplicacoes);
    if (erro) throw new ApiError(422, erro);
    data = {
      aplicacaoVerificadaEm: new Date(),
      aplicacaoVerificadaPorId: usuario.id,
      aplicacaoVerificadaPorNome: usuario.nome,
      revisaoCadastro: false,
      revisaoCadastroMotivo: null,
      revisaoCadastroEm: null,
    };
  } else if (body.acao === "remover_selo") {
    data = { aplicacaoVerificadaEm: null, aplicacaoVerificadaPorId: null, aplicacaoVerificadaPorNome: null };
  } else if (body.acao === "marcar_revisao") {
    data = {
      revisaoCadastro: true,
      revisaoCadastroMotivo: body.motivo,
      revisaoCadastroEm: new Date(),
      aplicacaoVerificadaEm: null,
      aplicacaoVerificadaPorId: null,
      aplicacaoVerificadaPorNome: null,
    };
  } else {
    data = { revisaoCadastro: false, revisaoCadastroMotivo: null, revisaoCadastroEm: null };
  }

  const atualizado = await prisma.$transaction(async (tx) => {
    const u = await tx.produto.update({
      where: { id },
      data,
      select: {
        aplicacaoVerificadaEm: true,
        aplicacaoVerificadaPorNome: true,
        revisaoCadastro: true,
        revisaoCadastroMotivo: true,
      },
    });
    await registrarAuditoria(tx, {
      usuarioId: usuario.id,
      acao: `CADASTRO_${body.acao.toUpperCase()}`,
      entidade: "Produto",
      entidadeId: id,
      antes,
      depois: u,
    });
    return u;
  });
  return NextResponse.json(atualizado);
});
