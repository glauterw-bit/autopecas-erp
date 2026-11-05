// Normalização e relevância da busca de peças (funções puras, sem banco).
// As funções SQL busca_codigo()/busca_texto() da migração
// 20261104150000_indices_busca fazem a mesma coisa do lado do Postgres.

/** Remove acentos (equivalente ao unaccent para o alfabeto latino). */
export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Código de peça normalizado: maiúsculo, sem acento e só letras e números.
 * "45022-sna.a00" → "45022SNAA00"; "0 986 4B0 123" → "09864B0123".
 */
export function normalizarCodigo(s: string): string {
  return semAcento(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Texto normalizado: minúsculo, sem acento e com espaços simples. */
export function normalizarTexto(s: string): string {
  return semAcento(s).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Escapa os curingas do LIKE (%, _ e \) para o termo ser literal. */
export function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const ANO = /^(19[5-9]\d|20[0-4]\d)$/;

export interface TermoAnalisado {
  /** termo original sem espaços nas pontas (para match exato como está cadastrado) */
  bruto: string;
  /** código normalizado (pode ser vazio) */
  codigo: string;
  /** texto normalizado inteiro (para similaridade) */
  texto: string;
  /** palavras que precisam aparecer (descrição, marca ou modelo) */
  palavras: string[];
  /** anos citados no termo ("sprinter 2015") */
  anos: number[];
}

export function analisarTermo(termo: string): TermoAnalisado {
  const bruto = termo.trim();
  const texto = normalizarTexto(bruto);
  const palavras: string[] = [];
  const anos: number[] = [];
  for (const p of texto.split(" ")) {
    if (!p) continue;
    if (ANO.test(p)) anos.push(Number(p));
    else palavras.push(p);
  }
  return { bruto, codigo: normalizarCodigo(bruto), texto, palavras, anos };
}

/**
 * Formas em que uma palavra mista de letra e número pode estar escrita na
 * descrição: "5w30" também é "5w-30" ou "5w 30"; "15w40" também é "15w-40".
 * Sem isso, "oleo 5w30" não achava "Óleo Mobil Super 5W-30". Aceita o termo já
 * normalizado (minúsculo, sem acento). Limita a 2 trocas de letra/número por
 * palavra (até 9 formas) para não pesar no banco. Palavra sem mistura volta
 * como veio.
 */
export function variantesPalavra(palavra: string): string[] {
  const base = palavra.replace(/([a-z])-(\d)/g, "$1$2").replace(/(\d)-([a-z])/g, "$1$2");
  if (!/^[a-z0-9]+$/.test(base)) return [palavra];
  const partes = base.match(/\d+|[a-z]+/g) ?? [];
  if (partes.length < 2 || partes.length > 3) return [palavra];
  let formas: string[] = [partes[0]!];
  for (const parte of partes.slice(1)) {
    formas = formas.flatMap((f) => [f + parte, `${f}-${parte}`, `${f} ${parte}`]);
  }
  return [...new Set([palavra, ...formas])];
}

/** Quanto mais alto, mais relevante. */
export enum Relevancia {
  TEXTO = 0,
  CODIGO_CONTEM = 1,
  CODIGO_COMECA = 2,
  CODIGO_EXATO = 3,
}

export interface CodigosProduto {
  sku: string;
  codigoBarras?: string | null;
  codigoFabricante?: string | null;
  codigoOem?: string | null;
}

/**
 * Relevância de um produto para um código já normalizado:
 * exato > começa com > contém. Devolve null se nenhum código casa.
 * Mesma regra do CASE em busca.ts (buscarPorCodigo).
 */
export function relevanciaCodigo(p: CodigosProduto, codigo: string): Relevancia | null {
  if (!codigo) return null;
  const cods = [p.sku, p.codigoBarras, p.codigoFabricante, p.codigoOem]
    .filter((c): c is string => !!c)
    .map(normalizarCodigo)
    .filter(Boolean);
  if (cods.some((c) => c === codigo)) return Relevancia.CODIGO_EXATO;
  if (cods.some((c) => c.startsWith(codigo))) return Relevancia.CODIGO_COMECA;
  if (cods.some((c) => c.includes(codigo))) return Relevancia.CODIGO_CONTEM;
  return null;
}

export interface Candidato {
  id: string;
  nome: string;
  relevancia: Relevancia;
  /** similaridade do texto (0..1); desempata dentro da mesma relevância */
  similaridade: number;
}

/**
 * Junta candidatos de código e de texto: remove repetidos (fica a maior
 * relevância) e ordena por relevância e similaridade. No empate, mantém a
 * ordem de entrada, que já vem do banco (nome, id): assim a página 2 continua
 * exatamente de onde a página 1 parou.
 */
export function ordenarPorRelevancia(cands: Candidato[]): Candidato[] {
  const porId = new Map<string, Candidato>();
  for (const c of cands) {
    const atual = porId.get(c.id);
    if (
      !atual ||
      c.relevancia > atual.relevancia ||
      (c.relevancia === atual.relevancia && c.similaridade > atual.similaridade)
    ) {
      porId.set(c.id, c);
    }
  }
  return [...porId.values()].sort(
    (a, b) =>
      b.relevancia - a.relevancia ||
      b.similaridade - a.similaridade,
  );
}
