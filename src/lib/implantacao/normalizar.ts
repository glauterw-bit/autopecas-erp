// Normalização e checagem de campos vindos de sistema antigo
// ===========================================================
import { Prisma } from "@prisma/client";

export const Decimal = Prisma.Decimal;
export type Dec = Prisma.Decimal;

export class ErroCampo extends Error {}

// Número em formato brasileiro ("1.234,56") ou com ponto decimal ("1234.56").
// "1.234" sem vírgula é ambíguo (mil e duzentos ou um vírgula dois?) e é recusado.
export function lerNumero(texto: string | undefined): Dec | undefined {
  if (texto === undefined) return undefined;
  let s = texto.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (s === "" || s === "-") return undefined;
  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negativo = !negativo;
    s = s.slice(1);
  }
  if (s.includes(",")) {
    if (!/^\d{1,3}(\.\d{3})*,\d+$|^\d+,\d+$/.test(s)) throw new ErroCampo(`número inválido "${texto}"`);
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    throw new ErroCampo(`número ambíguo "${texto}": use vírgula para decimais (ex.: 1234,00 ou 1,234)`);
  } else if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new ErroCampo(`número inválido "${texto}"`);
  }
  const d = new Decimal(s);
  return negativo ? d.neg() : d;
}

// Valor em reais → centavos inteiros (meio centavo arredonda para cima).
export function paraCentavos(v: Dec): number {
  return v.mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function centavosParaTexto(c: number): string {
  const neg = c < 0;
  const abs = Math.abs(c);
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cent = String(abs % 100).padStart(2, "0");
  return `${neg ? "-" : ""}R$ ${reais},${cent}`;
}

export function soDigitos(s: string | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

export function cnpjValido(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((acc, p, i) => acc + p * Number(cnpj[i]), 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(cnpj[12]) && dv(13) === Number(cnpj[13]);
}

export function documentoValido(doc: string): boolean {
  return doc.length === 11 ? cpfValido(doc) : doc.length === 14 ? cnpjValido(doc) : false;
}

// Mascara para mensagem e log (LGPD): mostra só o miolo.
export function mascararDoc(doc: string | undefined): string {
  const d = soDigitos(doc);
  if (d.length === 11) return `***.${d.slice(3, 6)}.***-**`;
  if (d.length === 14) return `**.${d.slice(2, 5)}.***/****-**`;
  return d ? "***" : "";
}

// GTIN-8/12/13/14 com dígito verificador.
export function gtinValido(g: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(g)) return false;
  const digitos = g.split("").map(Number);
  const dv = digitos.pop()!;
  const soma = digitos.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (soma % 10)) % 10 === dv;
}

// Datas: dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd (com ou sem hora). Meio-dia UTC para
// não "voltar um dia" no fuso de São Paulo.
export function lerData(texto: string | undefined): Date | undefined {
  if (texto === undefined || texto.trim() === "") return undefined;
  const s = texto.trim();
  let a: number, m: number, d: number;
  let r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:\s.*)?$/.exec(s);
  if (r) {
    d = Number(r[1]);
    m = Number(r[2]);
    a = Number(r[3].length === 2 ? `20${r[3]}` : r[3]);
  } else if ((r = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(s))) {
    a = Number(r[1]);
    m = Number(r[2]);
    d = Number(r[3]);
  } else throw new ErroCampo(`data inválida "${texto}" (use dd/mm/aaaa)`);
  const dt = new Date(Date.UTC(a, m - 1, d, 12));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d)
    throw new ErroCampo(`data inexistente "${texto}"`);
  return dt;
}

export function lerSimNao(texto: string | undefined): boolean | undefined {
  if (texto === undefined) return undefined;
  const s = texto.trim().toUpperCase();
  if (["S", "SIM", "1", "A", "ATIVO", "TRUE", "T", "Y", "YES"].includes(s)) return true;
  if (["N", "NAO", "NÃO", "0", "I", "INATIVO", "FALSE", "F", "NO", "BLOQUEADO", "D", "DESATIVADO"].includes(s))
    return false;
  throw new ErroCampo(`valor "${texto}" não é sim/não`);
}

export function texto(s: string | undefined, max = 500): string | undefined {
  if (s === undefined) return undefined;
  const t = s.replace(/\s+/g, " ").trim();
  return t === "" ? undefined : t.slice(0, max);
}
