// Dinheiro em centavos inteiros (nunca float para somar).

/** Converte valor decimal (Prisma.Decimal | string | number) para centavos inteiros. */
export function paraCentavos(v: { toString(): string } | number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const s = typeof v === "number" ? v.toFixed(6) : v.toString();
  const neg = s.trim().startsWith("-");
  const [int, dec = ""] = s.replace("-", "").trim().split(".");
  const dec3 = (dec + "000").slice(0, 3);
  // arredonda meio para cima na 3ª casa
  let cent = Number(int || "0") * 100 + Number(dec3.slice(0, 2));
  if (Number(dec3[2]) >= 5) cent += 1;
  return neg ? -cent : cent;
}

/** Valor em centavos de quantidade × preço unitário, arredondado no centavo (meio para cima). */
export function multiplicarCentavos(
  quantidade: { toString(): string } | number,
  precoUnitario: { toString(): string } | number,
): number {
  // quantidade com 3 casas × preço com 4 casas → inteiros em 10^-7 (BigInt, sem float)
  const qi = BigInt(Math.round(Number(quantidade.toString()) * 1000));
  const pi = BigInt(Math.round(Number(precoUnitario.toString()) * 10000));
  const bruto = qi * pi;
  const neg = bruto < 0n;
  const abs = neg ? -bruto : bruto;
  const cent = (abs + 50000n) / 100000n;
  return Number(neg ? -cent : cent);
}

export function centavosParaReais(c: number): number {
  return c / 100;
}
