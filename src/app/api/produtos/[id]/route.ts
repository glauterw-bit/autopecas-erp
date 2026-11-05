import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { registrarAuditoria } from "@/lib/crm/auditoria";
import { eanValido, ncmValido, problemasDoProduto } from "@/lib/crm/qualidade-cadastro";

// Ficha do produto para corrigir cadastro
// =======================================
// GET   (ESTOQUISTA): dados de cadastro, aplicações e problemas de qualidade.
// PATCH (ESTOQUISTA): corrige campos de CADASTRO (códigos, NCM, nome,
//   localização). Preço e estoque NÃO passam por aqui. Grava LogAuditoria.
//   Mudar código do fabricante/EAN não derruba o selo; o selo trata de aplicação.

type Ctx = { params: Promise<{ id: string }> };

const selectCadastro = {
  id: true,
  sku: true,
  nome: true,
  descricao: true,
  codigoBarras: true,
  codigoFabricante: true,
  codigoOem: true,
  ncm: true,
  cest: true,
  localizacao: true,
  marcaId: true,
  marca: { select: { nome: true } },
  curva: true,
  revisaoCadastro: true,
  revisaoCadastroMotivo: true,
  revisaoCadastroEm: true,
  aplicacaoVerificadaEm: true,
  aplicacaoVerificadaPorNome: true,
  aplicacoes: {
    select: {
      id: true,
      posicao: true,
      observacao: true,
      versao: {
        select: {
          descricao: true,
          anoInicio: true,
          anoFim: true,
          motor: true,
          modelo: { select: { nome: true, montadora: { select: { nome: true } } } },
        },
      },
    },
  },
} as const;

export const GET = comAuth<Ctx>("ESTOQUISTA", async (_req, ctx, usuario) => {
  const { id } = await ctx.params;
  const p = await prisma.produto.findFirst({ where: { id, empresaId: usuario.empresaId }, select: selectCadastro });
  if (!p) throw new ApiError(404, "Produto não encontrado");
  return NextResponse.json({
    ...p,
    problemas: problemasDoProduto({ ...p, qtdAplicacoes: p.aplicacoes.length }),
  });
});

const vazioParaNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const patchSchema = z
  .object({
    nome: z.string().trim().min(2).max(200).optional(),
    codigoBarras: z.preprocess(vazioParaNull, z.string().trim().max(14).nullable()).optional(),
    codigoFabricante: z.preprocess(vazioParaNull, z.string().trim().max(60).nullable()).optional(),
    codigoOem: z.preprocess(vazioParaNull, z.string().trim().max(60).nullable()).optional(),
    ncm: z.preprocess(vazioParaNull, z.string().trim().max(10).nullable()).optional(),
    localizacao: z.preprocess(vazioParaNull, z.string().trim().max(60).nullable()).optional(),
  })
  .strict();

export const PATCH = comAuth<Ctx>("ESTOQUISTA", async (req, ctx, usuario) => {
  const { id } = await ctx.params;
  const body = patchSchema.parse(await req.json());
  if (body.ncm) {
    const d = body.ncm.replace(/\D/g, "");
    if (!ncmValido(d)) throw new ApiError(422, "NCM precisa ter 8 dígitos (ex.: 8708.30.90).");
    body.ncm = d;
  }
  if (body.codigoBarras) {
    if (!eanValido(body.codigoBarras)) {
      throw new ApiError(422, "Código de barras (EAN) inválido: confira os números e o dígito final.");
    }
  }
  const atual = await prisma.produto.findFirst({
    where: { id, empresaId: usuario.empresaId },
    select: { id: true, nome: true, codigoBarras: true, codigoFabricante: true, codigoOem: true, ncm: true, localizacao: true },
  });
  if (!atual) throw new ApiError(404, "Produto não encontrado");

  const mudou = Object.fromEntries(
    Object.entries(body).filter(([k, v]) => v !== undefined && (atual as Record<string, unknown>)[k] !== v),
  );
  if (Object.keys(mudou).length === 0) return NextResponse.json({ ok: true, alterado: false });

  await prisma.$transaction(async (tx) => {
    await tx.produto.update({ where: { id }, data: mudou });
    await registrarAuditoria(tx, {
      usuarioId: usuario.id,
      acao: "CADASTRO_CORRIGIDO",
      entidade: "Produto",
      entidadeId: id,
      antes: Object.fromEntries(Object.keys(mudou).map((k) => [k, (atual as Record<string, unknown>)[k]])),
      depois: mudou,
    });
  });
  return NextResponse.json({ ok: true, alterado: true, campos: Object.keys(mudou) });
});
