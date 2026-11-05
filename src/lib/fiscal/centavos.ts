// Dinheiro em centavos inteiros
// =============================
// Todo cálculo da nota é feito em centavos (inteiros). Alíquota em percentual
// vira "pontos de 1/10.000 de %" (18% = 180000) para não usar float no produto.
// Arredondamento: meio para cima, por item (MOC da NF-e, regra de arredondamento
// de cada campo vXXX com 2 casas).

export function reaisParaCentavos(v: number | string | { toString(): string }): number {
  const s = typeof v === "number" ? v.toFixed(6) : v.toString();
  const neg = s.trim().startsWith("-");
  const [int, dec = ""] = s.replace("-", "").trim().split(".");
  const dec6 = (dec + "000000").slice(0, 6);
  const microReais = Number(int) * 1_000_000 + Number(dec6);
  const cent = Math.floor((microReais + 5_000) / 10_000);
  return neg ? -cent : cent;
}

export function centavosParaReais(c: number): number {
  return Math.round(c) / 100;
}

/** Percentual (ex.: 18, 0.9, 1.65) → inteiro em 1/10.000 de % (180000, 9000, 16500). */
export function percentualE4(p: number | string | { toString(): string }): number {
  const s = typeof p === "number" ? p.toFixed(6) : p.toString();
  const [int, dec = ""] = s.trim().split(".");
  return Number(int) * 10_000 + Number((dec + "0000").slice(0, 4));
}

/** valor (centavos) × alíquota (%), arredondado meio para cima. */
export function aplicarAliquota(baseCentavos: number, aliquotaPercentual: number | string): number {
  if (baseCentavos <= 0) return 0;
  const e4 = percentualE4(aliquotaPercentual);
  // base × (e4 / 10.000) / 100 = base × e4 / 1.000.000
  return Math.floor((baseCentavos * e4 + 500_000) / 1_000_000);
}

/** quantidade × preço unitário em centavos (qtd até 3 casas, preço até 4 casas). */
export function multiplicarQtdPreco(quantidade: number | string, precoUnitario: number | string): number {
  const qMil = Math.round(Number(quantidade) * 1000);
  const pE4 = Math.round(Number(precoUnitario) * 10_000);
  // qMil × pE4 está em 1e-7 reais; centavos = /1e5
  return Math.floor((qMil * pE4 + 50_000) / 100_000);
}

/** Rateia um valor (centavos) proporcionalmente aos pesos; a sobra vai para o último. */
export function ratear(totalCentavos: number, pesos: number[]): number[] {
  const soma = pesos.reduce((a, b) => a + b, 0);
  if (totalCentavos === 0 || soma === 0) return pesos.map(() => 0);
  const partes = pesos.map((p) => Math.floor((totalCentavos * p) / soma));
  const resto = totalCentavos - partes.reduce((a, b) => a + b, 0);
  partes[partes.length - 1] += resto;
  return partes;
}
