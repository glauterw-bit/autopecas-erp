import { prisma } from "../db";

// Busca inteligente do PDV
// ========================
// Tenta múltiplas estratégias em paralelo e retorna ranqueado:
//   1. Match exato em códigos (SKU, EAN, OEM, fabricante)
//   2. Filtro por aplicação veicular (versaoId)
//   3. Similaridade textual (pg_trgm) com fallback unaccent
//   4. (futuro) Busca semântica por embeddings

export interface ResultadoBuscaPDV {
  id: string;
  sku: string;
  nome: string;
  marca: string | null;
  precoVenda: number;
  precoPromocional: number | null;
  precoMinimo: number | null;
  custoMedio: number;
  estoque: number;
  fotoPrincipal: string | null;
  localizacao: string | null;
  garantiaMeses: number | null;
  unidade: string;
  matchTipo: "EXATO" | "APLICACAO" | "TEXTO";
  score: number;
}

export async function buscarProdutosPDV(opts: {
  empresaId: string;
  termo?: string;
  versaoId?: string;
  limite?: number;
}): Promise<ResultadoBuscaPDV[]> {
  const limite = opts.limite ?? 20;
  const termo = opts.termo?.trim();
  // 1. Match exato em qualquer código
  if (termo) {
    const exato = await prisma.produto.findMany({
      where: {
        empresaId: opts.empresaId,
        ativo: true,
        OR: [
          { sku: termo },
          { codigoBarras: termo },
          { codigoOem: termo },
          { codigoFabricante: termo },
        ],
      },
      include: { marca: true, estoques: true },
      take: limite,
    });
    if (exato.length > 0) {
      return exato.map((p) => mapResultado(p, "EXATO", 1));
    }
  }

  // 2. Filtro por aplicação veicular
  if (opts.versaoId) {
    const porApl = await prisma.produto.findMany({
      where: {
        empresaId: opts.empresaId,
        ativo: true,
        aplicacoes: { some: { versaoId: opts.versaoId } },
        ...(termo && { nome: { contains: termo, mode: "insensitive" } }),
      },
      include: { marca: true, estoques: true },
      take: limite,
    });
    if (porApl.length > 0) {
      return porApl.map((p) => mapResultado(p, "APLICACAO", 0.9));
    }
  }

  // 3. Similaridade textual (pg_trgm). Se a extensão não existir, cai para ILIKE.
  if (!termo) return [];
  type LinhaBusca = {
    id: string;
    sku: string;
    nome: string;
    marca: string | null;
    preco_venda: number;
    preco_promocional: number | null;
    estoque: number;
    foto_principal: string | null;
    score: number;
  };

  let sim: LinhaBusca[] = [];
  try {
    sim = await prisma.$queryRaw<LinhaBusca[]>`
      SELECT p.id, p.sku, p.nome, m.nome AS marca,
             p.preco_venda::float AS preco_venda,
             p.preco_promocional::float AS preco_promocional,
             p.foto_principal,
             COALESCE(SUM(e.quantidade - e.reservado), 0)::float AS estoque,
             similarity(unaccent(lower(p.nome || ' ' || COALESCE(m.nome,''))),
                        unaccent(lower(${termo}))) AS score
        FROM produtos p
        LEFT JOIN marcas m ON m.id = p.marca_id
        LEFT JOIN estoque_deposito e ON e.produto_id = p.id
       WHERE p.empresa_id = ${opts.empresaId}
         AND p.ativo = TRUE
         AND similarity(unaccent(lower(p.nome || ' ' || COALESCE(m.nome,''))),
                        unaccent(lower(${termo}))) > 0.2
       GROUP BY p.id, m.nome
       ORDER BY score DESC
       LIMIT ${limite}`;
  } catch {
    // Fallback robusto: ILIKE simples por palavra (sem pg_trgm/unaccent).
    const like = `%${termo.replace(/\s+/g, "%")}%`;
    sim = await prisma.$queryRaw<LinhaBusca[]>`
      SELECT p.id, p.sku, p.nome, m.nome AS marca,
             p.preco_venda::float AS preco_venda,
             p.preco_promocional::float AS preco_promocional,
             p.foto_principal,
             COALESCE(SUM(e.quantidade - e.reservado), 0)::float AS estoque,
             0.5::float AS score
        FROM produtos p
        LEFT JOIN marcas m ON m.id = p.marca_id
        LEFT JOIN estoque_deposito e ON e.produto_id = p.id
       WHERE p.empresa_id = ${opts.empresaId}
         AND p.ativo = TRUE
         AND (p.nome ILIKE ${like} OR COALESCE(m.nome,'') ILIKE ${like})
       GROUP BY p.id, m.nome
       ORDER BY p.nome ASC
       LIMIT ${limite}`;
  }

  if (sim.length === 0) return [];
  // Enriquece os resultados textuais com dados que o queryRaw não trouxe.
  const ids = sim.map((s) => s.id);
  const extras = await prisma.produto.findMany({
    where: { id: { in: ids } },
    select: { id: true, precoMinimo: true, custoMedio: true, localizacao: true, garantiaMeses: true, unidade: true },
  });
  const extraById = new Map(extras.map((e) => [e.id, e]));
  return sim.map((r) => {
    const ex = extraById.get(r.id);
    return {
      id: r.id,
      sku: r.sku,
      nome: r.nome,
      marca: r.marca,
      precoVenda: Number(r.preco_venda),
      precoPromocional: r.preco_promocional ? Number(r.preco_promocional) : null,
      precoMinimo: ex?.precoMinimo ? Number(ex.precoMinimo) : null,
      custoMedio: ex ? Number(ex.custoMedio) : 0,
      estoque: Number(r.estoque),
      fotoPrincipal: r.foto_principal,
      localizacao: ex?.localizacao ?? null,
      garantiaMeses: ex?.garantiaMeses ?? null,
      unidade: ex?.unidade ?? "UN",
      matchTipo: "TEXTO",
      score: Number(r.score),
    };
  });
}

function mapResultado(
  p: {
    id: string;
    sku: string;
    nome: string;
    marca: { nome: string } | null;
    precoVenda: unknown;
    precoPromocional: unknown;
    precoMinimo?: unknown;
    custoMedio?: unknown;
    localizacao?: string | null;
    garantiaMeses?: number | null;
    unidade?: string;
    estoques: Array<{ quantidade: unknown; reservado: unknown }>;
    fotoPrincipal: string | null;
  },
  matchTipo: ResultadoBuscaPDV["matchTipo"],
  score: number,
): ResultadoBuscaPDV {
  const estoque = p.estoques.reduce(
    (a, e) => a + Number(e.quantidade) - Number(e.reservado),
    0,
  );
  return {
    id: p.id,
    sku: p.sku,
    nome: p.nome,
    marca: p.marca?.nome ?? null,
    precoVenda: Number(p.precoVenda),
    precoPromocional: p.precoPromocional ? Number(p.precoPromocional) : null,
    precoMinimo: p.precoMinimo != null ? Number(p.precoMinimo) : null,
    custoMedio: p.custoMedio != null ? Number(p.custoMedio) : 0,
    estoque,
    fotoPrincipal: p.fotoPrincipal,
    localizacao: p.localizacao ?? null,
    garantiaMeses: p.garantiaMeses ?? null,
    unidade: p.unidade ?? "UN",
    matchTipo,
    score,
  };
}
