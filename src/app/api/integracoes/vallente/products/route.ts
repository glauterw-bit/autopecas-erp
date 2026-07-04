import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { empresaPorApiKey, respostaErro } from "@/lib/auth/guard";

// Catálogo consumido pelo GenericErpClient do Vallente Hub (sync de custo e
// estoque para o Mercado Livre). O shape segue o contrato do provider
// "custom": sku, costPrice, salePrice, stock, ncm, ean, oem, location...
// Paginação via ?offset=&limit= (o cliente atual faz um GET único; o limite
// alto cobre catálogos típicos sem estourar resposta).

export async function GET(req: NextRequest) {
  try {
    const empresa = await empresaPorApiKey(req);
    // Number(...) || fallback também cobre NaN ("limit=abc") e 0.
    const limit = Math.min(
      Math.max(Number(req.nextUrl.searchParams.get("limit")) || 5000, 1),
      10000,
    );
    const offset = Math.max(Number(req.nextUrl.searchParams.get("offset")) || 0, 0);

    const where = { empresaId: empresa.id, ativo: true } as const;
    const produtos = await prisma.produto.findMany({
      where,
      include: {
        marca: { select: { nome: true } },
        estoques: { select: { quantidade: true } },
        aplicacoes: {
          take: 3,
          include: {
            versao: { include: { modelo: { include: { montadora: true } } } },
          },
        },
      },
      orderBy: { sku: "asc" },
      skip: offset,
      take: limit,
    });

    const products = produtos.map((p) => ({
      id: p.id,
      erpId: p.id,
      sku: p.sku,
      description: p.nome,
      costPrice: Number(p.custoMedio),
      salePrice: Number(p.precoPromocional ?? p.precoVenda),
      stock: p.estoques.reduce((s, e) => s + Number(e.quantidade), 0),
      minStock: Number(p.estoqueMinimo),
      brand: p.marca?.nome ?? "",
      ncm: p.ncm ?? "",
      ean: p.codigoBarras ?? "",
      weight: p.pesoKg ? Number(p.pesoKg) : 0,
      width: p.larguraCm ? Number(p.larguraCm) : 0,
      height: p.alturaCm ? Number(p.alturaCm) : 0,
      depth: p.comprimentoCm ? Number(p.comprimentoCm) : 0,
      location: p.localizacao ?? "",
      supplier: "",
      lastPurchasePrice: p.custoUltimaCompra ? Number(p.custoUltimaCompra) : 0,
      lastPurchaseDate: "",
      oem: p.codigoOem ?? "",
      partNumber: p.codigoFabricante ?? "",
      application: p.aplicacoes
        .map((a) =>
          [
            a.versao.modelo.montadora.nome,
            a.versao.modelo.nome,
            a.versao.descricao,
          ].filter(Boolean).join(" "),
        )
        .join(" | "),
    }));

    const total = await prisma.produto.count({ where });
    return NextResponse.json({ products, count: products.length, total, offset });
  } catch (e) {
    return respostaErro(e);
  }
}
