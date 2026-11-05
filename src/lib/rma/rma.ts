import { prisma } from "../db";
import { ApiError } from "../auth/guard";
import { jaRetornadoPorItem, saldoRetornavel, travarItemVenda } from "../vendas/devolvido";

// RMA — Return Merchandise Authorization
// ======================================
// Encapsula o fluxo de devolução/troca/garantia. Em auto peças tem nuances:
//   - peça de freio/embreagem com defeito → análise técnica
//   - peça incompatível pelo vendedor → troca imediata
//   - garantia de fábrica → enviada ao fornecedor, recebe crédito
//
// Regras de negócio:
//   - Arrependimento (Código de Defesa do Consumidor): 7 dias após recebimento
//     APENAS para compras online (e-commerce/marketplace).
//   - Defeito: até o prazo de garantia (3-18 meses dependendo do produto).

export interface AbrirRmaInput {
  empresaId: string;
  vendaId?: string;
  itemVendaId?: string;
  produtoId: string;
  clienteId?: string;
  motivo:
    | "DEFEITO_FABRICACAO"
    | "PECA_ERRADA"
    | "PECA_INCOMPATIVEL"
    | "AVARIA_TRANSPORTE"
    | "ARREPENDIMENTO"
    | "EXCESSO_PEDIDO"
    | "PRAZO_VALIDADE"
    | "OUTROS";
  quantidade: number;
  descricao?: string;
  fotos?: string[];
}

export async function abrirRMA(input: AbrirRmaInput) {
  // Isolamento: venda, item e produto têm de ser da empresa da sessão.
  const produto = await prisma.produto.findFirst({
    where: { id: input.produtoId, empresaId: input.empresaId },
    select: { id: true },
  });
  if (!produto) throw new ApiError(404, "Produto não encontrado");

  let itemVendaId = input.itemVendaId;
  let venda: { id: string; origem: string; criadaEm: Date; clienteId: string | null } | null = null;
  if (input.vendaId) {
    venda = await prisma.venda.findFirst({
      where: { id: input.vendaId, empresaId: input.empresaId },
      select: { id: true, origem: true, criadaEm: true, clienteId: true },
    });
    if (!venda) throw new ApiError(404, "Venda não encontrada");
    const itens = await prisma.itemVenda.findMany({
      where: { vendaId: venda.id, produtoId: input.produtoId },
      select: { id: true },
    });
    if (itens.length === 0) throw new ApiError(422, "Esta peça não faz parte da venda informada.");
    if (itemVendaId) {
      if (!itens.some((i) => i.id === itemVendaId)) {
        throw new ApiError(422, "O item informado não é desta peça nesta venda.");
      }
    } else if (itens.length === 1) {
      itemVendaId = itens[0].id;
    } else {
      throw new ApiError(422, "A peça aparece mais de uma vez na venda: escolha qual item está voltando.");
    }
  } else if (itemVendaId) {
    throw new ApiError(422, "Informe a venda do item.");
  }

  // Validação CDC: arrependimento só vale para venda online e dentro de 7 dias.
  if (input.motivo === "ARREPENDIMENTO" && venda) {
    const onlineOrigens = [
      "ECOMMERCE", "WHATSAPP", "TELEFONE",
      "MARKETPLACE_ML", "MARKETPLACE_SHOPEE", "MARKETPLACE_AMAZON", "MARKETPLACE_MAGALU",
    ];
    if (!onlineOrigens.includes(venda.origem)) {
      throw new ApiError(422, "Arrependimento só se aplica a vendas online (CDC art. 49)");
    }
    const diff = (Date.now() - venda.criadaEm.getTime()) / 86_400_000;
    if (diff > 7) throw new ApiError(422, "Prazo de arrependimento expirado (7 dias)");
  }

  // Validação garantia
  if (input.motivo === "DEFEITO_FABRICACAO" && itemVendaId) {
    const garantia = await prisma.garantiaItem.findUnique({
      where: { itemVendaId },
    });
    if (garantia && garantia.fimGarantia.getTime() < Date.now()) {
      throw new ApiError(422, "Item fora do prazo de garantia");
    }
  }

  return prisma.$transaction(async (tx) => {
    // Mesma conta da devolução de balcão: trava o item e confere o saldo.
    if (itemVendaId) {
      const travado = await travarItemVenda(tx, input.empresaId, itemVendaId);
      if (!travado) throw new ApiError(404, "Item da venda não encontrado");
      const ja = (await jaRetornadoPorItem(tx, input.empresaId, [itemVendaId])).get(itemVendaId) ?? 0;
      const saldo = saldoRetornavel(travado.quantidade, ja);
      if (input.quantidade > saldo + 1e-9) {
        throw new ApiError(
          422,
          `Só ${saldo} unidade(s) deste item ainda podem voltar (já voltaram ${ja} por devolução de balcão ou RMA).`,
        );
      }
    }

    const ultimoRma = await tx.solicitacaoRMA.findFirst({
      where: { empresaId: input.empresaId },
      orderBy: { numeroRMA: "desc" },
      select: { numeroRMA: true },
    });

    return tx.solicitacaoRMA.create({
      data: {
        empresaId: input.empresaId,
        numeroRMA: (ultimoRma?.numeroRMA ?? 0) + 1,
        vendaId: venda?.id,
        itemVendaId,
        produtoId: input.produtoId,
        clienteId: input.clienteId ?? venda?.clienteId ?? undefined,
        motivo: input.motivo,
        descricao: input.descricao,
        fotos: input.fotos ?? [],
        quantidade: input.quantidade,
        status: "AGUARDANDO_AUTORIZACAO",
      },
    });
  });
}

export async function autorizarRMA(rmaId: string, autorizadoPor?: string) {
  return prisma.solicitacaoRMA.update({
    where: { id: rmaId },
    data: {
      status: "AGUARDANDO_RECEBIMENTO",
      autorizadaEm: new Date(),
      observacoes: autorizadoPor ? `Autorizado por ${autorizadoPor}` : undefined,
    },
  });
}

export async function registrarRecebimento(rmaId: string, inspecionadoPor?: string) {
  return prisma.solicitacaoRMA.update({
    where: { id: rmaId },
    data: {
      status: "RECEBIDA",
      recebidaEm: new Date(),
      inspecionadoPor,
    },
  });
}

export async function resolverRMA(opts: {
  rmaId: string;
  resolucao: "REEMBOLSO" | "TROCA_MESMO_PRODUTO" | "TROCA_OUTRO_PRODUTO" | "CREDITO_LOJA" | "REPARO" | "GARANTIA_FORNECEDOR" | "RECUSADA";
  valorReembolso?: number;
  novoItemVendaId?: string;
  trocaGarantiaFornecedorId?: string;
  empresaId: string;
}) {
  const rma = await prisma.solicitacaoRMA.findFirst({ where: { id: opts.rmaId, empresaId: opts.empresaId } });
  if (!rma) throw new ApiError(404, "RMA não encontrado");

  return prisma.$transaction(async (tx) => {
    // Resolve uma vez só: dois cliques não devolvem a peça ao estoque em dobro.
    const marcado = await tx.solicitacaoRMA.updateMany({
      where: { id: opts.rmaId, empresaId: opts.empresaId, status: { notIn: ["CONCLUIDA", "RECUSADA"] } },
      data: {
        status: opts.resolucao === "RECUSADA" ? "RECUSADA" : "CONCLUIDA",
        resolucao: opts.resolucao,
        valorReembolso: opts.valorReembolso,
        novoItemVendaId: opts.novoItemVendaId,
        trocaGarantiaFornecedorId: opts.trocaGarantiaFornecedorId,
        resolvidaEm: new Date(),
      },
    });
    if (marcado.count === 0) throw new ApiError(409, "Este RMA já foi resolvido.");
    const updated = await tx.solicitacaoRMA.findUniqueOrThrow({ where: { id: opts.rmaId } });

    // Reembolso: gera ContaPagar para o cliente
    if (opts.resolucao === "REEMBOLSO" && opts.valorReembolso && rma.clienteId) {
      await tx.contaPagar.create({
        data: {
          empresaId: rma.empresaId,
          descricao: `Reembolso RMA #${rma.numeroRMA}`,
          dataVencimento: new Date(),
          valor: opts.valorReembolso,
          status: "ABERTO",
        },
      });
    }

    // Volta para estoque se a peça veio sã
    if (
      opts.resolucao === "REEMBOLSO" ||
      opts.resolucao === "TROCA_OUTRO_PRODUTO"
    ) {
      // Confere de novo contra a devolução de balcão: se a peça já voltou ao
      // estoque por lá, não entra outra vez.
      if (rma.itemVendaId) {
        const travado = await travarItemVenda(tx, rma.empresaId, rma.itemVendaId);
        if (!travado) throw new ApiError(404, "Item da venda não encontrado");
        const outros = (await jaRetornadoPorItem(tx, rma.empresaId, [rma.itemVendaId], { excluirRmaId: rma.id })).get(rma.itemVendaId) ?? 0;
        if (Number(rma.quantidade) > saldoRetornavel(travado.quantidade, outros) + 1e-9) {
          throw new ApiError(409, "Esta peça já voltou ao estoque por outra devolução (balcão ou RMA). Confira antes de resolver.");
        }
      }
      const deposito = await tx.deposito.findFirst({
        where: { empresaId: rma.empresaId, ativo: true },
      });
      if (deposito) {
        await tx.estoqueDeposito.upsert({
          where: {
            produtoId_depositoId: {
              produtoId: rma.produtoId,
              depositoId: deposito.id,
            },
          },
          update: { quantidade: { increment: Number(rma.quantidade) } },
          create: {
            produtoId: rma.produtoId,
            depositoId: deposito.id,
            quantidade: rma.quantidade,
          },
        });
        await tx.movimentoEstoque.create({
          data: {
            produtoId: rma.produtoId,
            depositoId: deposito.id,
            tipo: "ENTRADA",
            quantidade: rma.quantidade,
            origemTipo: "DEVOLUCAO",
            origemId: rma.id,
            documento: `RMA #${rma.numeroRMA}`,
          },
        });
      }
    }

    return updated;
  });
}

// NF-e de devolução do RMA
// ------------------------
// Emite a NF-e de entrada (finalidade 4) referenciando a nota da venda e o
// item original (DFeReferenciado — obrigatório desde 03/11/2026, Rej. 321).
// Regras fiscais em src/lib/nfe/devolucao.ts.
export async function emitirNotaDevolucaoRMA(rmaId: string, empresaId: string) {
  const rma = await prisma.solicitacaoRMA.findFirst({ where: { id: rmaId, empresaId } });
  if (!rma) throw new ApiError(404, "RMA não encontrado");
  // Checagem rápida para a mensagem; a garantia de verdade está dentro da
  // transação de emitirNotaDevolucao (liga o RMA só onde notaDevolucaoId é nulo).
  if (rma.notaDevolucaoId) throw new ApiError(422, "Este RMA já tem nota de devolução");
  if (!rma.vendaId || !rma.itemVendaId) {
    throw new ApiError(422, "O RMA precisa estar ligado à venda e ao item vendido para emitir a nota de devolução");
  }
  if (!["RECEBIDA", "EM_ANALISE", "APROVADA", "CONCLUIDA"].includes(rma.status)) {
    throw new ApiError(422, "A peça precisa ter sido recebida antes da nota de devolução");
  }
  const { emitirNotaDevolucao } = await import("../nfe/devolucao");
  return emitirNotaDevolucao({
    empresaId,
    vendaId: rma.vendaId,
    itens: [{ itemVendaId: rma.itemVendaId, quantidade: Number(rma.quantidade) }],
    rmaId: rma.id,
  });
}
