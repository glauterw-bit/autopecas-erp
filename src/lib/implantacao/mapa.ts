// Mapa de colunas: qual coluna do arquivo vai para qual campo do ERP
// ==================================================================
import { CAMPOS, type Entidade, type Mapa, type RegistroBruto } from "./tipos";
import type { CsvLido } from "./csv";

export function normalizarNomeColuna(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Sugere o mapa comparando o cabeçalho com os apelidos de cada campo.
// Cada coluna vai para no máximo um campo; casamento exato vence parcial.
export function sugerirMapa(entidade: Entidade, cabecalhos: string[]): Mapa {
  const norm = cabecalhos.map((c) => ({ original: c, n: normalizarNomeColuna(c) }));
  const usadas = new Set<string>();
  const mapa: Mapa = {};
  const campos = CAMPOS[entidade];

  // 1ª passada: nome igual ao campo ou a um apelido
  for (const def of campos) {
    const alvos = [normalizarNomeColuna(def.campo), ...def.apelidos.map(normalizarNomeColuna)];
    const achou = norm.find((c) => !usadas.has(c.original) && alvos.includes(c.n));
    mapa[def.campo] = achou ? achou.original : null;
    if (achou) usadas.add(achou.original);
  }
  // 2ª passada: coluna que contém o apelido inteiro (ex.: "Preço de Venda R$" ⊃ "preco venda")
  for (const def of campos) {
    if (mapa[def.campo]) continue;
    const alvos = def.apelidos.map(normalizarNomeColuna).filter((a) => a.length >= 4);
    const achou = norm.find(
      (c) => !usadas.has(c.original) && alvos.some((a) => ` ${c.n} `.includes(` ${a} `)),
    );
    if (achou) {
      mapa[def.campo] = achou.original;
      usadas.add(achou.original);
    }
  }
  return mapa;
}

// Campos obrigatórios sem coluna escolhida.
export function camposObrigatoriosFaltando(entidade: Entidade, mapa: Mapa): string[] {
  return CAMPOS[entidade].filter((d) => d.obrigatorio && !mapa[d.campo]).map((d) => d.rotulo);
}

// Aplica o mapa ao CSV lido e devolve registros brutos (campo → texto).
export function aplicarMapa(entidade: Entidade, csv: CsvLido, mapa: Mapa): RegistroBruto[] {
  const idx: Record<string, number> = {};
  for (const def of CAMPOS[entidade]) {
    const col = mapa[def.campo];
    if (!col) continue;
    const i = csv.cabecalhos.indexOf(col);
    if (i < 0) throw new Error(`Coluna "${col}" não existe no arquivo`);
    idx[def.campo] = i;
  }
  return csv.linhas.map((cols, k) => {
    const valores: Record<string, string | undefined> = {};
    for (const [campo, i] of Object.entries(idx)) {
      const v = cols[i];
      valores[campo] = v === undefined || v.trim() === "" ? undefined : v.trim();
    }
    return { linha: csv.numeroLinha[k] ?? k + 2, valores };
  });
}
