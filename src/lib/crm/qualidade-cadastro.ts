// Qualidade de cadastro
// =====================
// Cadastro ruim é a dor número 1 do setor (docs/conhecimento/operacao-autopecas-e-crm.md §4).
// Aqui ficam as regras puras: o que é problema, o que é duplicado provável e o
// resumo do painel. A consulta ao banco fica na página/rota.

export type ProblemaCadastro =
  | "SEM_NCM"
  | "SEM_EAN"
  | "EAN_INVALIDO"
  | "SEM_APLICACAO"
  | "SEM_CODIGO_FABRICANTE"
  | "REVISAO"
  | "DUPLICADO"
  | "NAO_VERIFICADO";

export const ROTULO_PROBLEMA: Record<ProblemaCadastro, string> = {
  SEM_NCM: "Sem NCM",
  SEM_EAN: "Sem código de barras (EAN)",
  EAN_INVALIDO: "EAN inválido",
  SEM_APLICACAO: "Sem aplicação",
  SEM_CODIGO_FABRICANTE: "Sem código do fabricante",
  REVISAO: "Marcado para revisão",
  DUPLICADO: "Duplicado provável",
  NAO_VERIFICADO: "Aplicação não verificada",
};

/** NCM tem 8 dígitos; "00000000" não vale (a nota sai errada). */
export function ncmValido(ncm: string | null | undefined): boolean {
  if (!ncm) return false;
  const d = ncm.replace(/\D/g, "");
  return d.length === 8 && d !== "00000000";
}

/** GTIN-8/12/13/14 com dígito verificador (padrão GS1). */
export function eanValido(ean: string | null | undefined): boolean {
  if (!ean) return false;
  const d = ean.trim();
  if (!/^\d+$/.test(d) || ![8, 12, 13, 14].includes(d.length)) return false;
  if (/^0+$/.test(d)) return false;
  const digitos = d.split("").map(Number);
  const verificador = digitos.pop()!;
  let soma = 0;
  // da direita para a esquerda, pesos 3,1,3,1...
  for (let i = digitos.length - 1, peso = 3; i >= 0; i--, peso = peso === 3 ? 1 : 3) {
    soma += digitos[i] * peso;
  }
  return (10 - (soma % 10)) % 10 === verificador;
}

/** Normaliza código para comparar: maiúsculas, sem espaço, ponto, traço ou barra. */
export function normalizarCodigo(c: string | null | undefined): string {
  return (c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export interface ProdutoQualidade {
  id: string;
  marcaId: string | null;
  ncm: string | null;
  codigoBarras: string | null;
  codigoFabricante: string | null;
  qtdAplicacoes: number;
  revisaoCadastro: boolean;
  aplicacaoVerificadaEm: Date | null;
}

export interface Duplicidade {
  campo: "EAN" | "CODIGO_FABRICANTE";
  codigo: string;
  outrosIds: string[];
}

/**
 * Duplicados prováveis:
 * - mesmo EAN (normalizado) → o mesmo item físico cadastrado duas vezes;
 * - mesmo código do fabricante E mesma marca (ou marca vazia em um deles).
 * Mesmo código OEM NÃO é duplicado: várias marcas atendem o mesmo original.
 */
export function duplicadosPorCodigo(produtos: ProdutoQualidade[]): Map<string, Duplicidade[]> {
  const out = new Map<string, Duplicidade[]>();
  const add = (id: string, d: Duplicidade) => {
    const l = out.get(id) ?? [];
    l.push(d);
    out.set(id, l);
  };

  const porEan = new Map<string, string[]>();
  for (const p of produtos) {
    const k = normalizarCodigo(p.codigoBarras);
    if (k.length < 8) continue;
    porEan.set(k, [...(porEan.get(k) ?? []), p.id]);
  }
  for (const [codigo, ids] of porEan) {
    if (ids.length < 2) continue;
    for (const id of ids) add(id, { campo: "EAN", codigo, outrosIds: ids.filter((x) => x !== id) });
  }

  const porFab = new Map<string, ProdutoQualidade[]>();
  for (const p of produtos) {
    const k = normalizarCodigo(p.codigoFabricante);
    if (k.length < 3) continue;
    porFab.set(k, [...(porFab.get(k) ?? []), p]);
  }
  for (const [codigo, lista] of porFab) {
    if (lista.length < 2) continue;
    for (const p of lista) {
      const outros = lista.filter(
        (o) => o.id !== p.id && (o.marcaId === p.marcaId || !o.marcaId || !p.marcaId),
      );
      if (outros.length) add(p.id, { campo: "CODIGO_FABRICANTE", codigo, outrosIds: outros.map((o) => o.id) });
    }
  }
  return out;
}

export function problemasDoProduto(p: ProdutoQualidade, duplicado = false): ProblemaCadastro[] {
  const out: ProblemaCadastro[] = [];
  if (!ncmValido(p.ncm)) out.push("SEM_NCM");
  if (!p.codigoBarras?.trim()) out.push("SEM_EAN");
  else if (!eanValido(p.codigoBarras)) out.push("EAN_INVALIDO");
  if (p.qtdAplicacoes === 0) out.push("SEM_APLICACAO");
  else if (!p.aplicacaoVerificadaEm) out.push("NAO_VERIFICADO");
  if (!p.codigoFabricante?.trim()) out.push("SEM_CODIGO_FABRICANTE");
  if (p.revisaoCadastro) out.push("REVISAO");
  if (duplicado) out.push("DUPLICADO");
  return out;
}

export interface ResumoQualidade {
  total: number;
  porProblema: Record<ProblemaCadastro, number>;
  verificados: number;
  /** % do cadastro com aplicação verificada (inteiro 0–100) */
  pctVerificado: number;
  /** % sem nenhum problema (inteiro 0–100) */
  pctCompleto: number;
}

export function avaliarCadastro(produtos: ProdutoQualidade[]): {
  resumo: ResumoQualidade;
  problemas: Map<string, ProblemaCadastro[]>;
  duplicados: Map<string, Duplicidade[]>;
} {
  const duplicados = duplicadosPorCodigo(produtos);
  const problemas = new Map<string, ProblemaCadastro[]>();
  const porProblema = Object.fromEntries(
    (Object.keys(ROTULO_PROBLEMA) as ProblemaCadastro[]).map((k) => [k, 0]),
  ) as Record<ProblemaCadastro, number>;
  let verificados = 0;
  let completos = 0;
  for (const p of produtos) {
    const lista = problemasDoProduto(p, duplicados.has(p.id));
    problemas.set(p.id, lista);
    for (const pr of lista) porProblema[pr]++;
    if (p.aplicacaoVerificadaEm && p.qtdAplicacoes > 0) verificados++;
    if (lista.length === 0) completos++;
  }
  const total = produtos.length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  return {
    resumo: { total, porProblema, verificados, pctVerificado: pct(verificados), pctCompleto: pct(completos) },
    problemas,
    duplicados,
  };
}

/** Selo só pode ser dado a produto com ao menos uma aplicação cadastrada. */
export function validarSelo(qtdAplicacoes: number): string | null {
  return qtdAplicacoes > 0
    ? null
    : "Cadastre pelo menos uma aplicação (veículo, ano, motor, posição) antes de marcar como verificada.";
}
