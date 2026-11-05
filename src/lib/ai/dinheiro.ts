import { Prisma } from "@prisma/client";

// Dinheiro nos recursos de IA: nada de float. Entra Decimal/string/number do banco,
// sai centavos inteiros (arredondamento comum, meia unidade para cima, como na NF-e).

export type ValorDinheiro = Prisma.Decimal | string | number;

const D = Prisma.Decimal;

export function dec(v: ValorDinheiro | null | undefined): Prisma.Decimal {
  if (v === null || v === undefined || v === "") return new D(0);
  // number vira string antes para não herdar ruído binário (0.1 + 0.2).
  return new D(typeof v === "number" ? String(v) : v);
}

/** Valor em reais → centavos inteiros. */
export function paraCentavos(v: ValorDinheiro | null | undefined): number {
  return dec(v).mul(100).toDecimalPlaces(0, D.ROUND_HALF_UP).toNumber();
}

/** Preço unitário × quantidade → total em centavos (arredonda uma vez, no total do item). */
export function totalItemCentavos(precoUnitario: ValorDinheiro, quantidade: ValorDinheiro): number {
  return dec(precoUnitario).mul(dec(quantidade)).mul(100).toDecimalPlaces(0, D.ROUND_HALF_UP).toNumber();
}

/** Centavos → Decimal em reais com 2 casas (para gravar em coluna Decimal). */
export function centavosParaDecimal(c: number): Prisma.Decimal {
  return new D(c).div(100).toDecimalPlaces(2);
}

/** Centavos → "R$ 1.234,56". */
export function formatarCentavos(c: number): string {
  const neg = c < 0;
  const abs = Math.abs(Math.trunc(c));
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cent = String(abs % 100).padStart(2, "0");
  return `${neg ? "-" : ""}R$ ${reais},${cent}`;
}
