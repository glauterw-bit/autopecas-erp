import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import {
  analisarTermo,
  limparTermoBusca,
  escaparLike,
  ordenarPorRelevancia,
  Relevancia,
  variantesPalavra,
  type Candidato,
  type TermoAnalisado,
} from "./busca-normalizar";

// Busca inteligente do PDV
// ========================
// Ordem (todas filtram por empresaId e produto ativo):
//   1. Código exato como digitado (SKU, EAN, OEM, fabricante): devolve só esses.
//   2. Filtro por aplicação veicular (versaoId), se informado.
//   3. Código normalizado (sem traço/ponto/espaço) + palavras da descrição,
//      marca e modelo/ano da aplicação, em ordem de relevância:
//      código exato > código começa com > código contém > texto.
//   4. Se nada casou: palavras parecidas (pg_trgm), para erro de digitação.
// Índices: migração 20261104150000_indices_busca (GIN trigram em
// busca_texto(nome) e busca_codigos(...)). As expressões abaixo precisam ser
// idênticas às dos índices para o Postgres usá-los.

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
  matchTipo: "EXATO" | "APLICACAO" | "CODIGO" | "TEXTO";
  score: number;
}

const LIMITE_MAX = 100;

export async function buscarProdutosPDV(opts: {
  empresaId: string;
  termo?: string;
  versaoId?: string;
  limite?: number;
  /** 1 = primeira página */
  pagina?: number;
}): Promise<ResultadoBuscaPDV[]> {
  const limite = Math.min(Math.max(1, opts.limite ?? 20), LIMITE_MAX);
  const pagina = Math.max(1, Math.floor(opts.pagina ?? 1));
  const pular = (pagina - 1) * limite;
  const termo = limparTermoBusca(opts.termo) || undefined;
  const incluir = { marca: true, estoques: true } as const;

  // 1. Match exato em qualquer código, como está cadastrado (leitor de código de barras).
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
      include: incluir,
      orderBy: [{ nome: "asc" }, { id: "asc" }],
      skip: pular,
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
        aplicacoes: { some: { versaoId: limparTermoBusca(opts.versaoId, 40) } },
        ...(termo && { nome: { contains: termo, mode: "insensitive" } }),
      },
      include: incluir,
      orderBy: [{ nome: "asc" }, { id: "asc" }],
      skip: pular,
      take: limite,
    });
    if (porApl.length > 0) {
      return porApl.map((p) => mapResultado(p, "APLICACAO", 0.9));
    }
  }

  if (!termo) return [];
  const t = analisarTermo(termo);
  const quantos = pular + limite;

  // 3. Código normalizado e palavras, em paralelo.
  const [porCodigo, porTexto] = await Promise.all([
    buscarPorCodigo(opts.empresaId, t, quantos),
    buscarPorPalavras(opts.empresaId, t, quantos),
  ]);
  let candidatos = ordenarPorRelevancia([...porCodigo, ...porTexto]);

  // 4. Erro de digitação ("pastilia"): similaridade com índice trigram.
  if (candidatos.length === 0) {
    candidatos = await buscarPorSimilaridade(opts.empresaId, t, quantos);
  }

  const fatia = candidatos.slice(pular, pular + limite);
  if (fatia.length === 0) return [];
  const produtos = await prisma.produto.findMany({
    where: { empresaId: opts.empresaId, id: { in: fatia.map((c) => c.id) } },
    include: incluir,
  });
  const porId = new Map(produtos.map((p) => [p.id, p]));
  return fatia.flatMap((c) => {
    const p = porId.get(c.id);
    if (!p) return [];
    const tipo =
      c.relevancia === Relevancia.CODIGO_EXATO ? "EXATO" : c.relevancia === Relevancia.TEXTO ? "TEXTO" : "CODIGO";
    const score =
      c.relevancia === Relevancia.CODIGO_EXATO
        ? 1
        : c.relevancia === Relevancia.CODIGO_COMECA
          ? 0.8
          : c.relevancia === Relevancia.CODIGO_CONTEM
            ? 0.6
            : Math.min(0.5, c.similaridade);
    return [mapResultado(p, tipo, score)];
  });
}

type LinhaCandidato = { id: string; nome: string; relevancia: number; similaridade: number };

function paraCandidatos(linhas: LinhaCandidato[]): Candidato[] {
  return linhas.map((l) => ({
    id: l.id,
    nome: l.nome,
    relevancia: Number(l.relevancia) as Relevancia,
    similaridade: Number(l.similaridade),
  }));
}

/**
 * Código normalizado em SKU, EAN, fabricante ou OEM: exato > começa com > contém.
 * Usa o índice GIN trigram em busca_codigos(...). Com menos de 3 caracteres o
 * trigram não ajuda, então só vale o exato.
 */
async function buscarPorCodigo(empresaId: string, t: TermoAnalisado, quantos: number): Promise<Candidato[]> {
  const cod = t.codigo;
  if (cod.length < 3) return [];
  const contem = `%${escaparLike(cod)}%`;
  const comeca = `${escaparLike(cod)}%`;
  const linhas = await prisma.$queryRaw<LinhaCandidato[]>`
    SELECT p.id, p.nome, 0::float AS similaridade,
           CASE
             WHEN ${cod} IN (busca_codigo(p.sku), busca_codigo(p."codigoBarras"),
                             busca_codigo(p."codigoFabricante"), busca_codigo(p."codigoOem"))
               THEN ${Relevancia.CODIGO_EXATO}
             WHEN busca_codigo(p.sku) LIKE ${comeca} OR busca_codigo(p."codigoBarras") LIKE ${comeca}
               OR busca_codigo(p."codigoFabricante") LIKE ${comeca} OR busca_codigo(p."codigoOem") LIKE ${comeca}
               THEN ${Relevancia.CODIGO_COMECA}
             ELSE ${Relevancia.CODIGO_CONTEM}
           END::int AS relevancia
      FROM produtos p
     WHERE p."empresaId" = ${empresaId}
       AND p.ativo = TRUE
       AND busca_codigos(p.sku, p."codigoBarras", p."codigoFabricante", p."codigoOem") LIKE ${contem}
     ORDER BY relevancia DESC, p.nome ASC, p.id ASC
     LIMIT ${quantos}`;
  return paraCandidatos(linhas);
}

/**
 * Todas as palavras precisam aparecer (prefixo/parte: "past diant sprinter").
 * Cada palavra casa na descrição (índice GIN em busca_texto(nome)), no nome da
 * marca ou no modelo de uma aplicação veicular. Ano ("2015") casa com versão
 * cujo intervalo de anos o contém (do modelo citado, se houver) ou com o ano
 * escrito na descrição.
 */
async function buscarPorPalavras(empresaId: string, t: TermoAnalisado, quantos: number): Promise<Candidato[]> {
  if (t.palavras.length === 0 && t.anos.length === 0) return [];

  // Marcas e modelos são tabelas pequenas: resolve as palavras antes.
  const padroes = t.palavras.map((p) => `%${escaparLike(p)}%`);
  const [marcas, modelos] = padroes.length
    ? await Promise.all([
        prisma.$queryRaw<Array<{ id: string; n: string }>>`
          SELECT id, busca_texto(nome) AS n FROM marcas WHERE busca_texto(nome) LIKE ANY(${padroes})`,
        prisma.$queryRaw<Array<{ id: string; n: string }>>`
          SELECT id, busca_texto(nome) AS n FROM modelos_veiculo WHERE busca_texto(nome) LIKE ANY(${padroes})`,
      ])
    : [[], []];

  // Palavra só da descrição: condição direta (índice GIN). Palavra que também
  // é marca/modelo (ou ano): se alguma palavra é só da descrição, ela guia o
  // índice e as demais entram como OR; se nenhuma é, cada uma vira
  // p.id IN (união dos conjuntos), para o Postgres não varrer a tabela.
  // (Medido: cada forma é a mais rápida no seu caso; ver migração.)
  // Palavra mista ("5w30") vira várias formas ("5w-30", "5w 30"): ver variantesPalavra.
  const likeDescricao = (alias: string, palavra: string) =>
    Prisma.sql`(${Prisma.join(
      variantesPalavra(palavra).map((v) => Prisma.sql`busca_texto(${Prisma.raw(alias)}.nome) LIKE ${`%${escaparLike(v)}%`}`),
      " OR ",
    )})`;
  const porDescricao = (palavra: string) =>
    Prisma.sql`SELECT q.id FROM produtos q WHERE q."empresaId" = ${empresaId} AND ${likeDescricao("q", palavra)}`;
  const porAplicacao = (filtro: Prisma.Sql) => Prisma.sql`
    SELECT a."produtoId" FROM aplicacoes_veiculares a
      JOIN versoes_veiculo v ON v.id = a."versaoId"
     WHERE ${filtro}`;

  const todosModelos = modelos.map((m) => m.id);
  const simples: Prisma.Sql[] = [];
  const compostas: Prisma.Sql[][] = []; // cada item: conjuntos alternativos de ids
  for (const palavra of t.palavras) {
    const idsMarca = marcas.filter((m) => m.n.includes(palavra)).map((m) => m.id);
    const idsModelo = modelos.filter((m) => m.n.includes(palavra)).map((m) => m.id);
    if (!idsMarca.length && !idsModelo.length) {
      simples.push(likeDescricao("p", palavra));
      continue;
    }
    const conjuntos: Prisma.Sql[] = [porDescricao(palavra)];
    if (idsMarca.length) {
      conjuntos.push(
        Prisma.sql`SELECT q.id FROM produtos q WHERE q."empresaId" = ${empresaId} AND q."marcaId" = ANY(${idsMarca})`,
      );
    }
    if (idsModelo.length) conjuntos.push(porAplicacao(Prisma.sql`v."modeloId" = ANY(${idsModelo})`));
    compostas.push(conjuntos);
  }
  for (const ano of t.anos) {
    const filtroAno = Prisma.sql`COALESCE(v."anoInicio", 0) <= ${ano} AND COALESCE(v."anoFim", 9999) >= ${ano}`;
    const filtro = todosModelos.length
      ? Prisma.sql`${filtroAno} AND v."modeloId" = ANY(${todosModelos})`
      : filtroAno;
    compostas.push([porDescricao(String(ano)), porAplicacao(filtro)]);
  }
  const condicoes: Prisma.Sql[] = [...simples];
  for (const conjuntos of compostas) {
    condicoes.push(
      simples.length
        ? Prisma.sql`(${Prisma.join(
            conjuntos.map((c) => Prisma.sql`p.id IN (${c})`),
            " OR ",
          )})`
        : Prisma.sql`p.id IN (${Prisma.join(conjuntos, " UNION ALL ")})`,
    );
  }

  const linhas = await prisma.$queryRaw<LinhaCandidato[]>`
    SELECT p.id, p.nome, ${Relevancia.TEXTO}::int AS relevancia,
           similarity(busca_texto(p.nome), ${t.texto})::float AS similaridade
      FROM produtos p
     WHERE p."empresaId" = ${empresaId}
       AND p.ativo = TRUE
       AND ${Prisma.join(condicoes, " AND ")}
     ORDER BY similaridade DESC, p.nome ASC, p.id ASC
     LIMIT ${quantos}`;
  return paraCandidatos(linhas);
}

/**
 * Último recurso, para erro de digitação ("pastilia diantera"): cada palavra
 * (3+ letras) precisa ser parecida (word_similarity >= 0,5) com um trecho da
 * descrição. Usa o índice GIN em busca_texto(nome). Medido: a similaridade da
 * frase inteira > 0,2 trazia o mesmo resultado, mas revisava ~22 mil linhas.
 */
async function buscarPorSimilaridade(empresaId: string, t: TermoAnalisado, quantos: number): Promise<Candidato[]> {
  const palavras = t.palavras.filter((p) => p.length >= 3);
  if (palavras.length === 0) return [];
  const condicoes = palavras.map((p) => Prisma.sql`${p} <% busca_texto(p.nome)`);
  const [, linhas] = await prisma.$transaction([
    prisma.$executeRaw`SET LOCAL pg_trgm.word_similarity_threshold = 0.5`,
    prisma.$queryRaw<LinhaCandidato[]>`
      SELECT p.id, p.nome, ${Relevancia.TEXTO}::int AS relevancia,
             similarity(busca_texto(p.nome), ${t.texto})::float AS similaridade
        FROM produtos p
       WHERE p."empresaId" = ${empresaId}
         AND p.ativo = TRUE
         AND ${Prisma.join(condicoes, " AND ")}
       ORDER BY similaridade DESC, p.nome ASC, p.id ASC
       LIMIT ${quantos}`,
  ]);
  return paraCandidatos(linhas);
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
