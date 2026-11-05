// Máscara para texto que vai para o log do servidor (LGPD): CPF/CNPJ completo,
// token e senha nunca devem aparecer. Use em console.error/warn quando a
// mensagem puder carregar dado de cliente (erro do banco, corpo de requisição).

const DOC = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const SEGREDO = /\b(senha|password|token|secret|api[_-]?key|authorization|cookie)(["']?\s*[:=]\s*["']?)[^\s"',;&}]{3,}/gi;
const TOKEN_LONGO = /\b(?:vlt_|sk-|pbkdf2\$)[A-Za-z0-9_$.-]{8,}/g;

export function mascararTexto(texto: string): string {
  return texto
    .replace(BEARER, "$1 ***")
    .replace(SEGREDO, "$1$2***")
    .replace(TOKEN_LONGO, "***")
    .replace(DOC, "***");
}

/** Erro pronto para o log: nome e mensagem mascarados, sem objeto inteiro nem stack com valores. */
export function erroSeguro(e: unknown, max = 300): string {
  const nome = e instanceof Error ? e.name : typeof e;
  const msg = e instanceof Error ? e.message : String(e);
  return mascararTexto(`${nome}: ${msg}`).slice(0, max);
}
