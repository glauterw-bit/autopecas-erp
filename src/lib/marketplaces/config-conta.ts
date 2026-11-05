// Configuração por conta de marketplace (campo MarketplaceConta.configuracoes, JSON).
//
// importarPedidosDesde: só pedidos criados a partir desta data viram venda no ERP.
// Existe para a loja não lançar em dobro o que já digitou à mão antes de conectar.
// Padrão: o momento em que a conta foi conectada (ISO gravado no callback OAuth);
// contas antigas sem o campo usam a data de criação da conta.

export const CHAVE_IMPORTAR_DESDE = "importarPedidosDesde";

export function importarDesdeDaConta(conta: { configuracoes: unknown; criadoEm: Date }): Date {
  const cfg = conta.configuracoes;
  if (cfg && typeof cfg === "object" && !Array.isArray(cfg)) {
    const bruto = (cfg as Record<string, unknown>)[CHAVE_IMPORTAR_DESDE];
    if (typeof bruto === "string") {
      const d = new Date(bruto);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return conta.criadoEm;
}

/** Junta a chave nova ao JSON existente sem apagar as outras opções da conta. */
export function mesclarConfiguracoes(atual: unknown, novo: Record<string, unknown>): Record<string, unknown> {
  const base = atual && typeof atual === "object" && !Array.isArray(atual) ? (atual as Record<string, unknown>) : {};
  return { ...base, ...novo };
}
