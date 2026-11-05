import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import type { ClienteML } from "./mercado-livre";

// Compatibilidades de autopeças no Mercado Livre a partir da AplicacaoVeicular
// ===========================================================================
// Docs (consultadas em 04/11/2026 pelos índices de busca; o fetch direto é
// bloqueado pelo ML):
// - https://developers.mercadolivre.com.br/pt-br/compatibilidades-itens-e-produtos-de-autopecas
// - https://developers.mercadolivre.com.br/pt-br/referencias-de-dominios-produtos-e-atributos-para-autopecas
// - https://developers.mercadolibre.com.ar/en_us/compatibility-between-items-and-vehicle-accessories
//
// Fluxo:
//   1) Cada VersaoVeiculo do ERP vira uma busca no domínio de veículos do ML
//      (padrão MLB-CARS_AND_VANS_FOR_COMPATIBILITIES — carros e vans):
//      valores de BRAND, MODEL e VEHICLE_YEAR via
//      POST /catalog_domains/{dominio}/attributes/{ATTR}/top_values
//      e veículos via POST /catalog_compatibilities/products_search/chunks.
//      Casamento só por nome EXATO (normalizado). Na dúvida não manda nada:
//      compatibilidade errada é devolução e reclamação.
//      O resultado fica em CompatibilidadeMLCache (global, 30 dias).
//   2) Lê as compatibilidades atuais do anúncio (GET /items/{id}/compatibilities).
//      Desde 15/07/2026 as de origem CATALOGO (geridas pelo catálogo do ML)
//      são só leitura: nunca tentamos apagar ou reenviar; só somamos as do
//      vendedor (SELLER) que faltam.
//   3) POST /items/{id}/compatibilities {products:[{id, creation_source}]} em
//      lotes. Padrão é simulação (dry-run): só envia com confirmação humana.
//
// [H] a confirmar na primeira conta real: o tamanho máximo do lote
// (usamos 200), o nome do atributo de motor e o formato exato de
// `creation_source` (usamos "DEFAULT").

export const DOMINIO_VEICULOS_PADRAO = "MLB-CARS_AND_VANS_FOR_COMPATIBILITIES";
export const LOTE_COMPAT = 200;
const VALIDADE_CACHE_MS = 30 * 24 * 3600 * 1000;

export interface ValorAtributo {
  id: string;
  name: string;
}

export function normalizarNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9.]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Escolhe o valor do ML para um nome do ERP. Só aceita igualdade exata após
 * normalizar (acento, caixa, pontuação); se houver mais de um, ou nenhum,
 * devolve null.
 */
export function escolherValor(nome: string, candidatos: ValorAtributo[]): ValorAtributo | null {
  const alvo = normalizarNome(nome);
  const iguais = candidatos.filter((c) => normalizarNome(c.name) === alvo);
  if (iguais.length === 1) return iguais[0]!;
  // Mesmo nome com ids distintos não dá para decidir.
  return null;
}

export function anosDaVersao(
  v: { anoInicio?: number | null; anoFim?: number | null },
  modelo: { anoInicio?: number | null; anoFim?: number | null },
  anoAtual = new Date().getFullYear(),
): number[] {
  const ini = v.anoInicio ?? modelo.anoInicio;
  const fim = v.anoFim ?? modelo.anoFim ?? anoAtual + 1;
  if (!ini || fim < ini || fim - ini > 45) return [];
  return Array.from({ length: fim - ini + 1 }, (_, i) => ini + i);
}

/** Corpo da busca de veículos no catálogo de compatibilidades (pura). */
export function corpoBuscaVeiculos(
  dominio: string,
  marcaId: string,
  modeloId: string,
  anoIds: string[],
) {
  return {
    domain_id: dominio,
    site_id: "MLB",
    known_attributes: [
      { id: "BRAND", value_ids: [marcaId] },
      { id: "MODEL", value_ids: [modeloId] },
      { id: "VEHICLE_YEAR", value_ids: anoIds },
    ],
  };
}

export interface VeiculoML {
  id: string;
  name?: string;
  attributes?: Array<{ id: string; value_name?: string | null; values?: Array<{ name?: string }> }>;
}

/** Cilindrada do motor ("2.3", "2.8") quando a versão do ERP informa. */
export function cilindrada(texto?: string | null): string | null {
  const m = texto?.match(/\b(\d\.\d)\b/);
  return m ? m[1]! : null;
}

/**
 * Filtra veículos do ML pelo motor da versão. Se a versão tem cilindrada e
 * nenhum veículo bate, devolve vazio (melhor não anunciar do que errar).
 */
export function filtrarPorMotor(veiculos: VeiculoML[], motorVersao?: string | null): VeiculoML[] {
  const cc = cilindrada(motorVersao);
  if (!cc) return veiculos;
  return veiculos.filter((v) => {
    const textos = [v.name ?? "", ...(v.attributes ?? []).flatMap((a) => [a.value_name ?? "", ...(a.values ?? []).map((x) => x.name ?? "")])];
    return textos.some((t) => cilindrada(t) === cc);
  });
}

export interface CompatExistente {
  catalog_product_id?: string | null;
  source?: string | null;
}

export interface PlanoCompat {
  adicionar: string[];
  jaExistentes: number;
  doCatalogo: number; // só leitura desde 15/07/2026
}

/** O que enviar: desejados que o anúncio ainda não tem. Nunca remove nada. */
export function planejarCompatibilidades(desejados: string[], existentes: CompatExistente[]): PlanoCompat {
  const ja = new Set(existentes.map((e) => e.catalog_product_id).filter((x): x is string => !!x));
  const doCatalogo = existentes.filter((e) => (e.source ?? "").toUpperCase() === "CATALOGO").length;
  const adicionar = [...new Set(desejados)].filter((id) => !ja.has(id));
  return { adicionar, jaExistentes: desejados.length - adicionar.length, doCatalogo };
}

export function lotes<T>(xs: T[], n = LOTE_COMPAT): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

// ---------------------------------------------------------------------------

async function topValues(
  ml: ClienteML,
  dominio: string,
  atributo: string,
  conhecidos: Array<{ id: string; value_ids: string[] }>,
): Promise<ValorAtributo[]> {
  const data = await ml.req<ValorAtributo[] | { values?: ValorAtributo[] }>(
    {
      method: "POST",
      url: `/catalog_domains/${dominio}/attributes/${atributo}/top_values`,
      data: { known_attributes: conhecidos },
    },
    `valores de ${atributo}`,
  );
  return Array.isArray(data) ? data : (data.values ?? []);
}

export interface MapeamentoVersao {
  status: "MAPEADO" | "SEM_CORRESPONDENCIA";
  produtosMl: string[];
  detalhe?: string;
}

/** Mapeia uma versão do ERP para veículos do ML (com cache global). */
export async function mapearVersao(
  ml: ClienteML,
  versaoId: string,
  dominio = process.env.ML_DOMINIO_COMPAT || DOMINIO_VEICULOS_PADRAO,
): Promise<MapeamentoVersao> {
  const cache = await prisma.compatibilidadeMLCache.findUnique({ where: { versaoId } });
  if (cache && cache.dominio === dominio && Date.now() - cache.atualizadoEm.getTime() < VALIDADE_CACHE_MS) {
    return {
      status: cache.status as MapeamentoVersao["status"],
      produtosMl: (cache.produtosMl as string[]) ?? [],
      detalhe: cache.detalhe ?? undefined,
    };
  }

  const versao = await prisma.versaoVeiculo.findUniqueOrThrow({
    where: { id: versaoId },
    include: { modelo: { include: { montadora: true } } },
  });
  const r = await (async (): Promise<MapeamentoVersao> => {
    const sem = (detalhe: string): MapeamentoVersao => ({ status: "SEM_CORRESPONDENCIA", produtosMl: [], detalhe });
    const anos = anosDaVersao(versao, versao.modelo);
    if (anos.length === 0) return sem("versão sem ano de início no cadastro");
    const marca = escolherValor(versao.modelo.montadora.nome, await topValues(ml, dominio, "BRAND", []));
    if (!marca) return sem(`marca "${versao.modelo.montadora.nome}" não encontrada no ML`);
    const modelo = escolherValor(
      versao.modelo.nome,
      await topValues(ml, dominio, "MODEL", [{ id: "BRAND", value_ids: [marca.id] }]),
    );
    if (!modelo) return sem(`modelo "${versao.modelo.nome}" não encontrado no ML`);
    const valoresAno = await topValues(ml, dominio, "VEHICLE_YEAR", [
      { id: "BRAND", value_ids: [marca.id] },
      { id: "MODEL", value_ids: [modelo.id] },
    ]);
    const anoIds = valoresAno.filter((v) => anos.includes(Number(v.name))).map((v) => v.id);
    if (anoIds.length === 0) return sem(`nenhum ano ${anos[0]}–${anos[anos.length - 1]} no ML`);

    const veiculos: VeiculoML[] = [];
    // A busca é paginada; seguimos até acabar (sem teto fixo).
    for (let offset = 0; ; ) {
      const data = await ml.req<{ results?: VeiculoML[]; paging?: { total?: number } }>(
        {
          method: "POST",
          url: `/catalog_compatibilities/products_search/chunks`,
          data: corpoBuscaVeiculos(dominio, marca.id, modelo.id, anoIds),
          params: { offset, limit: 100 },
        },
        "buscar veículos",
      );
      const res = data.results ?? [];
      veiculos.push(...res);
      offset += res.length;
      if (res.length === 0 || offset >= (data.paging?.total ?? offset)) break;
    }
    const filtrados = filtrarPorMotor(veiculos, versao.motor ?? versao.descricao);
    if (filtrados.length === 0) return sem(`nenhum veículo do ML com motor ${cilindrada(versao.motor ?? versao.descricao)}`);
    return { status: "MAPEADO", produtosMl: filtrados.map((v) => v.id) };
  })();

  await prisma.compatibilidadeMLCache.upsert({
    where: { versaoId },
    create: { versaoId, dominio, produtosMl: r.produtosMl, status: r.status, detalhe: r.detalhe },
    update: { dominio, produtosMl: r.produtosMl, status: r.status, detalhe: r.detalhe ?? null },
  });
  return r;
}

export interface ResultadoCompatAnuncio {
  anuncioId: string;
  itemIdExterno: string;
  plano: PlanoCompat;
  enviados: number;
  versoesSemCorrespondencia: Array<{ versaoId: string; detalhe?: string }>;
  simulacao: boolean;
}

/**
 * Sincroniza as compatibilidades dos anúncios ML de um produto.
 * `confirmar=false` (padrão) só calcula o plano; nada é enviado ao ML.
 */
export async function sincronizarCompatibilidadesProduto(opts: {
  ml: ClienteML;
  contaId: string;
  empresaId: string;
  produtoId: string;
  confirmar?: boolean;
  usuarioId?: string;
}): Promise<ResultadoCompatAnuncio[]> {
  const { ml, contaId, empresaId, produtoId } = opts;
  const produto = await prisma.produto.findFirst({
    where: { id: produtoId, empresaId },
    select: { id: true, aplicacoes: { select: { versaoId: true } } },
  });
  if (!produto) throw new Error("Produto não encontrado");
  const anuncios = await prisma.marketplaceAnuncio.findMany({
    where: { contaId, produtoId, conta: { empresaId, plataforma: "MERCADO_LIVRE" } },
    select: { id: true, itemIdExterno: true, compatibilidadesCatalog: true },
  });
  if (anuncios.length === 0) return [];

  const desejados = new Set<string>();
  const semCorrespondencia: Array<{ versaoId: string; detalhe?: string }> = [];
  for (const versaoId of [...new Set(produto.aplicacoes.map((a) => a.versaoId))]) {
    const m = await mapearVersao(ml, versaoId);
    if (m.status === "MAPEADO") m.produtosMl.forEach((id) => desejados.add(id));
    else semCorrespondencia.push({ versaoId, detalhe: m.detalhe });
  }

  const resultados: ResultadoCompatAnuncio[] = [];
  for (const a of anuncios) {
    const atual = await ml.req<{ products?: CompatExistente[] } | CompatExistente[]>(
      { method: "GET", url: `/items/${a.itemIdExterno}/compatibilities` },
      "ler compatibilidades",
    );
    const existentes = Array.isArray(atual) ? atual : (atual.products ?? []);
    const plano = planejarCompatibilidades([...desejados], existentes);
    let enviados = 0;
    if (opts.confirmar && plano.adicionar.length > 0) {
      for (const lote of lotes(plano.adicionar)) {
        await ml.req(
          {
            method: "POST",
            url: `/items/${a.itemIdExterno}/compatibilities`,
            data: { products: lote.map((id) => ({ id, creation_source: "DEFAULT" })) },
          },
          "gravar compatibilidades",
        );
        enviados += lote.length;
      }
      const antes = a.compatibilidadesCatalog;
      const depois = {
        sincronizadoEm: new Date().toISOString(),
        enviados,
        doCatalogo: plano.doCatalogo,
        semCorrespondencia,
      };
      await prisma.marketplaceAnuncio.update({
        where: { id: a.id },
        data: { compatibilidadesCatalog: depois as Prisma.InputJsonValue },
      });
      await prisma.logAuditoria.create({
        data: {
          usuarioId: opts.usuarioId,
          acao: "ML_COMPATIBILIDADES_ENVIADAS",
          entidade: "MarketplaceAnuncio",
          entidadeId: a.id,
          dadosAntes: (antes ?? undefined) as Prisma.InputJsonValue | undefined,
          dadosDepois: { ...depois, adicionados: plano.adicionar } as Prisma.InputJsonValue,
        },
      });
    }
    resultados.push({
      anuncioId: a.id,
      itemIdExterno: a.itemIdExterno,
      plano,
      enviados,
      versoesSemCorrespondencia: semCorrespondencia,
      simulacao: !opts.confirmar,
    });
  }
  return resultados;
}
