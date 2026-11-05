import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { podePerfil } from "@/lib/auth/config";
import { registrarAuditoria } from "@/lib/crm/auditoria";
import { CAMPOS_FISCAIS_PRODUTO } from "@/lib/produtos/campos-fiscais";
import { eanValido, ncmValido, problemasDoProduto } from "@/lib/crm/qualidade-cadastro";

// Ficha do produto para corrigir cadastro
// =======================================
// GET   (ESTOQUISTA): dados de cadastro, aplicações e problemas de qualidade.
// PATCH (ESTOQUISTA): corrige campos de CADASTRO (códigos, nome, localização).
//   Campos FISCAIS (NCM, CEST, CST/CSOSN, CFOP, origem, PIS/COFINS, IBS/CBS)
//   exigem FINANCEIRO ou acima. Preço e estoque NÃO passam por aqui.
//   Grava LogAuditoria com antes e depois.
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
    // Campos fiscais: só FINANCEIRO ou acima (erro aqui vira nota errada e multa).
    cest: z.preprocess(vazioParaNull, z.string().trim().max(9).nullable()).optional(),
    cstIcms: z.preprocess(vazioParaNull, z.string().trim().regex(/^\d{2,3}$/, "CST/CSOSN com 2 ou 3 dígitos").nullable()).optional(),
    cfopVendaInterna: z.preprocess(vazioParaNull, z.string().trim().regex(/^\d{4}$/, "CFOP com 4 dígitos").nullable()).optional(),
    cfopVendaInterestadual: z.preprocess(vazioParaNull, z.string().trim().regex(/^\d{4}$/, "CFOP com 4 dígitos").nullable()).optional(),
    origemFiscal: z.number().int().min(0).max(8).optional(),
    monofasicoPisCofins: z.boolean().optional(),
    cstPis: z.preprocess(vazioParaNull, z.string().trim().regex(/^\d{2}$/).nullable()).optional(),
    cstCofins: z.preprocess(vazioParaNull, z.string().trim().regex(/^\d{2}$/).nullable()).optional(),
    cstIbsCbs: z.preprocess(vazioParaNull, z.string().trim().regex(/^\d{3}$/).nullable()).optional(),
    cClassTrib: z.preprocess(vazioParaNull, z.string().trim().regex(/^\d{6}$/).nullable()).optional(),
  })
  .strict();

export const PATCH = comAuth<Ctx>("ESTOQUISTA", async (req, ctx, usuario) => {
  const { id } = await ctx.params;
  const body = patchSchema.parse(await req.json());
  const fiscais = CAMPOS_FISCAIS_PRODUTO.filter((k) => body[k] !== undefined);
  if (fiscais.length && !podePerfil(usuario.perfil, "FINANCEIRO")) {
    throw new ApiError(
      403,
      `Dados fiscais (${fiscais.join(", ")}) só podem ser alterados por quem cuida do fiscal (perfil Financeiro ou acima). ` +
        `Peça a revisão a essa pessoa.`,
    );
  }
  if (body.cest) {
    const d = body.cest.replace(/\D/g, "");
    if (d.length !== 7) throw new ApiError(422, "CEST precisa ter 7 dígitos (ex.: 01.001.00).");
    body.cest = d;
  }
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
    select: {
      id: true, nome: true, codigoBarras: true, codigoFabricante: true, codigoOem: true, ncm: true, localizacao: true,
      cest: true, cstIcms: true, cfopVendaInterna: true, cfopVendaInterestadual: true, origemFiscal: true,
      monofasicoPisCofins: true, cstPis: true, cstCofins: true, cstIbsCbs: true, cClassTrib: true,
    },
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
      acao: Object.keys(mudou).some((k) => (CAMPOS_FISCAIS_PRODUTO as readonly string[]).includes(k))
        ? "CADASTRO_FISCAL_ALTERADO"
        : "CADASTRO_CORRIGIDO",
      entidade: "Produto",
      entidadeId: id,
      antes: Object.fromEntries(Object.keys(mudou).map((k) => [k, (atual as Record<string, unknown>)[k]])),
      depois: mudou,
    });
  });
  return NextResponse.json({ ok: true, alterado: true, campos: Object.keys(mudou) });
});
