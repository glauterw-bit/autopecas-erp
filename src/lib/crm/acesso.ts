import { podePerfil } from "../auth/config";

// LGPD na ficha do cliente
// ========================
// Crédito, limite, saldo devedor e CPF/CNPJ completo só para quem precisa:
// FINANCEIRO ou acima, ou a pessoa vendedora responsável pela carteira.

export function podeVerCredito(
  usuario: { id: string; perfil: string },
  cliente: { vendedorResponsavelId: string | null },
): boolean {
  if (podePerfil(usuario.perfil, "FINANCEIRO")) return true;
  return !!cliente.vendedorResponsavelId && cliente.vendedorResponsavelId === usuario.id;
}

/** Documento parcial para quem não pode ver o completo: ***.456.789-** / **.345.678/0001-** */
export function documentoParcial(doc: string | null | undefined): string {
  if (!doc) return "—";
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-**`;
  return "***";
}

/**
 * Versão do cliente para listas: quem não pode ver crédito recebe o documento
 * parcial e NÃO recebe limite, saldo devedor, score nem hash de senha B2B.
 */
export function protegerCliente<
  T extends {
    vendedorResponsavelId: string | null;
    cpfCnpj: string | null;
    limiteCredito?: unknown;
    saldoDevedor?: unknown;
    scoreCredito?: unknown;
    senhaHashB2B?: unknown;
  },
>(usuario: { id: string; perfil: string }, c: T) {
  const { senhaHashB2B: _s, ...semSenha } = c;
  if (podeVerCredito(usuario, c)) return { ...semSenha, podeVerCredito: true as const };
  const { limiteCredito: _l, saldoDevedor: _d, scoreCredito: _sc, ...resto } = semSenha;
  return { ...resto, cpfCnpj: documentoParcial(c.cpfCnpj), podeVerCredito: false as const };
}
