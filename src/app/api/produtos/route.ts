import { limparTermoBusca } from "@/lib/catalogo/busca-normalizar";
import { exigirLimiteProdutos } from "@/lib/assinatura/politica";
import { registrarAuditoria } from "@/lib/auth/auditoria";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { podePerfil } from "@/lib/auth/config";
import { CAMPOS_FISCAIS_PRODUTO, PERFIL_FISCAL_PRODUTO } from "@/lib/produtos/campos-fiscais";
import { eanValido, ncmValido } from "@/lib/crm/qualidade-cadastro";

const vazioParaNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const texto = (max: number) => z.preprocess(vazioParaNull, z.string().trim().max(max).nullable()).optional();

const produtoSchema = z.object({
  sku: z.string().trim().min(1, "Informe o código interno (SKU).").max(40),
  nome: z.string().trim().min(2, "Informe o nome do produto.").max(200),
  codigoBarras: texto(14),
  codigoOem: texto(60),
  codigoFabricante: texto(60),
  marcaId: texto(40),
  categoriaId: texto(40),
  unidade: z.string().trim().min(1).max(5).default("UN"),
  custoMedio: z.number().nonnegative().default(0),
  precoVenda: z.number().nonnegative().default(0),
  precoMinimo: z.number().nonnegative().optional().nullable(),
  margemAlvo: z.number().min(0).max(1).optional().nullable(),
  ncm: texto(10),
  cest: texto(9),
  origemFiscal: z.number().int().min(0).max(8).default(0),
  estoqueMinimo: z.number().nonnegative().default(0),
  leadTimeDias: z.number().int().positive().default(7),
  localizacao: texto(60),
});

export const GET = comAuth("ESTOQUISTA", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const q = limparTermoBusca(req.nextUrl.searchParams.get("q"));
  const ativo = req.nextUrl.searchParams.get("ativo") !== "false";
  const produtos = await prisma.produto.findMany({
    where: {
      empresaId,
      ativo,
      ...(q && {
        OR: [
          { sku: { contains: q, mode: "insensitive" } },
          { nome: { contains: q, mode: "insensitive" } },
          { codigoBarras: q },
          { codigoOem: q },
          { codigoFabricante: q },
        ],
      }),
    },
    include: { marca: true, categoria: true, estoques: true },
    take: 100,
    orderBy: { atualizadoEm: "desc" },
  });
  return NextResponse.json(produtos);
});

export const POST = comAuth("ESTOQUISTA", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const bruto = await req.json();
  const body = produtoSchema.parse(bruto);
  await exigirLimiteProdutos(empresaId);

  // Dados fiscais mudam a nota: só FINANCEIRO ou acima, também na criação (igual ao PATCH).
  // "Informado" = veio com valor; origem 0 é o padrão e não conta.
  const informado = (k: string): boolean => {
    const v = (bruto as Record<string, unknown> | null)?.[k];
    if (v === undefined || v === null) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (k === "origemFiscal") return v !== 0;
    return true;
  };
  const fiscais = CAMPOS_FISCAIS_PRODUTO.filter(informado);
  if (fiscais.length && !podePerfil(usuario.perfil, PERFIL_FISCAL_PRODUTO)) {
    throw new ApiError(
      403,
      `Dados fiscais (${fiscais.join(", ")}) só podem ser preenchidos por quem cuida do fiscal (perfil Financeiro ou acima). ` +
        `Cadastre o produto sem eles e peça a essa pessoa para completar.`,
    );
  }
  // TODO (decisão do dono): hoje custoMedio e precoVenda podem ser definidos na criação por qualquer perfil
  // que cadastra produto (ESTOQUISTA ou acima). Definir se isso exige perfil maior ou passa por LogAuditoria própria.

  if (body.codigoBarras && !eanValido(body.codigoBarras)) {
    throw new ApiError(422, "Código de barras (EAN) inválido: confira os números e o dígito final.");
  }
  if (body.ncm) {
    const d = body.ncm.replace(/\D/g, "");
    if (!ncmValido(d)) throw new ApiError(422, "NCM precisa ter 8 números (ex.: 8708.30.90).");
    body.ncm = d;
  }
  if (body.cest) {
    const d = body.cest.replace(/\D/g, "");
    if (d.length !== 7) throw new ApiError(422, "CEST precisa ter 7 números (ex.: 01.001.00).");
    body.cest = d;
  }
  const dup = await prisma.produto.findFirst({
    where: { empresaId, sku: body.sku },
    select: { id: true },
  });
  if (dup) throw new ApiError(409, `Já existe um produto com o código interno ${body.sku}.`);
  if (body.codigoBarras) {
    const ean = await prisma.produto.findFirst({
      where: { empresaId, codigoBarras: body.codigoBarras, ativo: true },
      select: { sku: true },
    });
    if (ean) throw new ApiError(409, `Este código de barras já está no produto ${ean.sku}.`);
  }

  const produto = await prisma.$transaction(async (tx) => {
    const criado = await tx.produto.create({ data: { ...body, empresaId } });
    await registrarAuditoria(tx, {
      empresaId,
      usuarioId: usuario.id,
      acao: "PRODUTO_CRIADO",
      entidade: "Produto",
      entidadeId: criado.id,
      antes: null,
      depois: {
        sku: criado.sku,
        nome: criado.nome,
        custoMedio: body.custoMedio,
        precoVenda: body.precoVenda,
        ncm: criado.ncm,
        codigoBarras: criado.codigoBarras,
      },
    });
    return criado;
  });
  return NextResponse.json(produto, { status: 201 });
});
