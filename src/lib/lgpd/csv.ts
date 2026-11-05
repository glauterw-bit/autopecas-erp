// CSV para exportação: separador ";" e BOM, que é o que o Excel brasileiro abre
// direito. Valores que começam com = + - @ ganham aspa simples (injeção de fórmula).

function texto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    // Decimal do Prisma tem toFixed/toString próprio; Json vira texto JSON.
    const proto = Object.getPrototypeOf(v);
    if (proto === Object.prototype || proto === null || Array.isArray(v)) return JSON.stringify(v);
    return String(v);
  }
  return String(v);
}

export function celulaCsv(v: unknown): string {
  let s = texto(v);
  if (/^[=+\-@]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Colunas = chaves do primeiro registro, menos as proibidas (hash de senha etc.). */
export function linhasParaCsv(
  linhas: Record<string, unknown>[],
  opts: { omitir?: readonly string[]; colunas?: readonly string[] } = {},
): string {
  const omitir = new Set(opts.omitir ?? []);
  const colunas = (opts.colunas ?? (linhas[0] ? Object.keys(linhas[0]) : [])).filter((c) => !omitir.has(c));
  const corpo = linhas.map((l) => colunas.map((c) => celulaCsv(l[c])).join(";"));
  return "﻿" + [colunas.join(";"), ...corpo].join("\r\n") + "\r\n";
}
