// Validação de CNPJ pelos dígitos verificadores (módulo 11).
// Aceita o CNPJ numérico e o alfanumérico (a Receita Federal passou a emitir
// CNPJ com letras a partir de julho de 2026 — IN RFB 2.229/2024; conferir a
// norma vigente). Nos dois, cada caractere vale (código ASCII − 48) e os dois
// últimos caracteres são sempre dígitos.

export function limparCnpj(valor: string): string {
  return valor.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function digito(base: string): number {
  const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += (base.charCodeAt(i) - 48) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(valor: string): boolean {
  const c = limparCnpj(valor);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c)) return false;
  if (/^(.)\1{13}$/.test(c)) return false; // 00000000000000, 11111111111111…
  const d1 = digito(c.slice(0, 12));
  const d2 = digito(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`);
}
