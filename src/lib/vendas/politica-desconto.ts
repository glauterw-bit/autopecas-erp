import { ApiError } from "@/lib/auth/guard";

// Política de desconto por perfil
// ===============================
// Limita o desconto TOTAL da venda (descontoGeral + descontos de itens)
// como fração do valorBruto, conforme o perfil do usuário logado.
// Também decide quem pode vender abaixo do precoMinimo do produto.

// Fração máxima de desconto sobre o valorBruto. `null` = sem limite.
const LIMITES_DESCONTO: Record<string, number | null> = {
  ADMIN: null,
  GERENTE: 0.15,
  FINANCEIRO: 0.1,
  VENDEDOR: 0.05,
  CAIXA: 0.05,
  TECNICO: 0.05,
};

// Perfis não mapeados recebem o limite mais restrito (5%).
const LIMITE_PADRAO = 0.05;

// Tolerância p/ arredondamento de centavos.
const EPSILON = 0.005;

export function limiteDescontoPerfil(perfil: string): number | null {
  const limite = LIMITES_DESCONTO[perfil];
  return limite === undefined ? LIMITE_PADRAO : limite;
}

/**
 * Desconto que só passou porque o perfil tem alçada maior que a do balcão
 * (acima do limite padrão de 5%). Esse desconto vai para o LogAuditoria.
 */
export function descontoAcimaDaPolitica(opts: { valorBruto: number; descontoTotal: number }): boolean {
  if (opts.valorBruto <= 0 || opts.descontoTotal <= 0) return false;
  return opts.descontoTotal > opts.valorBruto * LIMITE_PADRAO + EPSILON;
}

// Hierarquia local só para a regra do preço mínimo (GERENTE ou acima).
const NIVEL: Record<string, number> = {
  ADMIN: 100,
  GERENTE: 80,
  FINANCEIRO: 60,
  VENDEDOR: 50,
  CAIXA: 50,
  TECNICO: 40,
  ESTOQUISTA: 30,
};

export function ehGerenteOuAcima(perfil: string): boolean {
  return (NIVEL[perfil] ?? 0) >= NIVEL.GERENTE;
}

/**
 * Valida o desconto total da venda contra o limite do perfil.
 * Lança ApiError 422 com mensagem clara se exceder.
 */
export function validarDescontoTotal(opts: {
  perfil: string;
  valorBruto: number;
  descontoTotal: number;
}): void {
  const { perfil, valorBruto, descontoTotal } = opts;
  if (descontoTotal <= 0 || valorBruto <= 0) return;
  const limite = limiteDescontoPerfil(perfil);
  if (limite === null) return; // ADMIN: sem limite
  const percentual = descontoTotal / valorBruto;
  if (descontoTotal > valorBruto * limite + EPSILON) {
    throw new ApiError(
      422,
      `Desconto total de ${(percentual * 100).toFixed(1)}% excede o limite de ${(limite * 100).toFixed(0)}% do perfil ${perfil}. Solicite autorização de um gerente.`,
    );
  }
}

/**
 * Valida item vendido abaixo do preço mínimo: só GERENTE ou acima pode.
 * `precoEfetivo` = preço unitário já com desconto do item rateado.
 * Lança ApiError 422 se violar.
 */
export function validarPrecoMinimoItem(opts: {
  perfil: string;
  produtoNome: string;
  precoEfetivo: number;
  precoMinimo: number | null | undefined;
}): void {
  const { perfil, produtoNome, precoEfetivo, precoMinimo } = opts;
  if (!precoMinimo || precoMinimo <= 0) return;
  if (precoEfetivo >= precoMinimo - EPSILON) return;
  if (ehGerenteOuAcima(perfil)) return;
  throw new ApiError(
    422,
    `Item "${produtoNome}" a R$ ${precoEfetivo.toFixed(2)} está abaixo do preço mínimo (R$ ${precoMinimo.toFixed(2)}), requer gerente.`,
  );
}
