import { registrarAuditoria } from "@/lib/auth/auditoria";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth } from "@/lib/auth/guard";

const produtoSchema = z.object({
  sku: z.string().min(1),
  nome: z.string().min(2),
  codigoBarras: z.string().optional().nullable(),
  codigoOem: z.string().optional().nullable(),
  codigoFabricante: z.string().optional().nullable(),
  marcaId: z.string().optional().nullable(),
  categoriaId: z.string().optional().nullable(),
  unidade: z.string().default("UN"),
  custoMedio: z.number().nonnegative().default(0),
  precoVenda: z.number().nonnegative().default(0),
  precoMinimo: z.number().nonnegative().optional().nullable(),
  margemAlvo: z.number().min(0).max(1).optional().nullable(),
  ncm: z.string().optional().nullable(),
  estoqueMinimo: z.number().nonnegative().default(0),
  leadTimeDias: z.number().int().positive().default(7),
  localizacao: z.string().optional().nullable(),
});

export const GET = comAuth("ESTOQUISTA", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const q = req.nextUrl.searchParams.get("q")?.trim();
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
  const body = produtoSchema.parse(await req.json());
  const produto = await prisma.$transaction(async (tx) => {
    const p = await tx.produto.create({ data: { ...body, empresaId } });
    await registrarAuditoria(tx, {
      empresaId,
      usuarioId: usuario.id,
      acao: "PRODUTO_CRIADO",
      entidade: "Produto",
      entidadeId: p.id,
      antes: null,
      depois: {
        sku: p.sku,
        precoVenda: p.precoVenda.toString(),
        precoMinimo: p.precoMinimo?.toString() ?? null,
      },
    });
    return p;
  });
  return NextResponse.json(produto, { status: 201 });
});
