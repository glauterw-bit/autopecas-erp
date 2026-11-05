// Retorno / devolução com motivo obrigatório
// ==========================================
// Motivos (docs/conhecimento/operacao-autopecas-e-crm.md, item 5):
// - ERRO_CADASTRO: peça errada por cadastro → marca o produto para revisão.
// - ERRO_BALCAO: peça errada no balcão (escolha de quem vendeu).
// - GARANTIA_DEFEITO: garantia/defeito → NÃO volta para o estoque vendável.
// - DESISTENCIA: cliente desistiu.

export const MOTIVOS_RETORNO = ["ERRO_CADASTRO", "ERRO_BALCAO", "GARANTIA_DEFEITO", "DESISTENCIA"] as const;
export type MotivoRetorno = (typeof MOTIVOS_RETORNO)[number];

export const ROTULO_MOTIVO_RETORNO: Record<MotivoRetorno, string> = {
  ERRO_CADASTRO: "Peça errada por cadastro",
  ERRO_BALCAO: "Peça errada no balcão",
  GARANTIA_DEFEITO: "Garantia / defeito",
  DESISTENCIA: "Desistência",
};

export function voltaEstoquePadrao(motivo: MotivoRetorno): boolean {
  return motivo !== "GARANTIA_DEFEITO";
}

export function marcaRevisaoCadastro(motivo: MotivoRetorno): boolean {
  return motivo === "ERRO_CADASTRO";
}

export class RetornoInvalido extends Error {}

export interface ItemVendido {
  id: string;
  produtoId: string;
  quantidade: number;
  jaDevolvido: number;
}

/**
 * Valida o pedido de retorno. Lança RetornoInvalido com mensagem para a tela.
 * Sem itens → devolve o saldo de todos.
 */
export function validarRetorno(entrada: {
  motivo: string | null | undefined;
  itens?: Array<{ itemVendaId: string; quantidade: number }>;
  itensVenda: ItemVendido[];
}): { motivo: MotivoRetorno; itens: Array<{ item: ItemVendido; quantidade: number }> } {
  if (!entrada.motivo) throw new RetornoInvalido("Informe o motivo do retorno.");
  if (!(MOTIVOS_RETORNO as readonly string[]).includes(entrada.motivo)) {
    throw new RetornoInvalido("Motivo de retorno inválido.");
  }
  const motivo = entrada.motivo as MotivoRetorno;
  const porId = new Map(entrada.itensVenda.map((i) => [i.id, i]));
  const pedidos = new Map<string, number>();

  if (entrada.itens && entrada.itens.length) {
    for (const it of entrada.itens) {
      const item = porId.get(it.itemVendaId);
      if (!item) throw new RetornoInvalido("Item não pertence a esta venda.");
      if (!(it.quantidade > 0)) throw new RetornoInvalido("Quantidade precisa ser maior que zero.");
      pedidos.set(it.itemVendaId, (pedidos.get(it.itemVendaId) ?? 0) + it.quantidade);
    }
  } else {
    for (const i of entrada.itensVenda) {
      const saldo = i.quantidade - i.jaDevolvido;
      if (saldo > 0) pedidos.set(i.id, saldo);
    }
  }
  if (pedidos.size === 0) throw new RetornoInvalido("Nada a devolver: os itens já voltaram.");

  const itens: Array<{ item: ItemVendido; quantidade: number }> = [];
  for (const [id, qtd] of pedidos) {
    const item = porId.get(id)!;
    const saldo = Math.round((item.quantidade - item.jaDevolvido) * 1000) / 1000;
    if (qtd > saldo + 1e-9) {
      throw new RetornoInvalido(`Quantidade maior que a disponível para devolução (disponível: ${saldo}).`);
    }
    itens.push({ item, quantidade: qtd });
  }
  return { motivo, itens };
}

/** A venda fica DEVOLVIDA quando todos os itens voltaram por completo. */
export function vendaTotalmenteDevolvida(itensVenda: ItemVendido[], devolvidoAgora: Map<string, number>): boolean {
  return itensVenda.every((i) => i.jaDevolvido + (devolvidoAgora.get(i.id) ?? 0) >= i.quantidade - 1e-9);
}
