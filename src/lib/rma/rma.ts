import { prisma } from "../db";

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
  // Validação CDC: arrependimento só vale para venda online e dentro de 7 dias.
  if (input.motivo === "ARREPENDIMENTO" && input.vendaId) {
    const venda = await prisma.venda.findUniqueOrThrow({
      where: { id: input.vendaId },
      select: { origem: true, criadaEm: true },
    });
    const onlineOrigens = [
      "ECOMMERCE", "WHATSAPP", "TELEFONE",
      "MARKETPLACE_ML", "MARKETPLACE_SHOPEE", "MARKETPLACE_AMAZON", "MARKETPLACE_MAGALU",
    ];
    if (!onlineOrigens.includes(venda.origem)) {
      throw new Error("Arrependimento só se aplica a vendas online (CDC art. 49)");
    }
    const diff = (Date.now() - venda.criadaEm.getTime()) / 86_400_000;
    if (diff > 7) throw new Error("Prazo de arrependimento expirado (7 dias)");
  }

  // Validação garantia
  if (input.motivo === "DEFEITO_FABRICACAO" && input.itemVendaId) {
    const garantia = await prisma.garantiaItem.findUnique({
      where: { itemVendaId: input.itemVendaId },
    });
    if (garantia && garantia.fimGarantia.getTime() < Date.now()) {
      throw new Error("Item fora do prazo de garantia");
    }
  }

  const ultimoRma = await prisma.solicitacaoRMA.findFirst({
    where: { empresaId: input.empresaId },
    orderBy: { numeroRMA: "desc" },
    select: { numeroRMA: true },
  });

  return prisma.solicitacaoRMA.create({
    data: {
      empresaId: input.empresaId,
      numeroRMA: (ultimoRma?.numeroRMA ?? 0) + 1,
      vendaId: input.vendaId,
      itemVendaId: input.itemVendaId,
      produtoId: input.produtoId,
      clienteId: input.clienteId,
      motivo: input.motivo,
      descricao: input.descricao,
      fotos: input.fotos ?? [],
      quantidade: input.quantidade,
      status: "AGUARDANDO_AUTORIZACAO",
    },
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
}) {
  const rma = await prisma.solicitacaoRMA.findUniqueOrThrow({ where: { id: opts.rmaId } });

  return prisma.$transaction(async (tx) => {
    const updated = await tx.solicitacaoRMA.update({
      where: { id: opts.rmaId },
      data: {
        status: opts.resolucao === "RECUSADA" ? "RECUSADA" : "CONCLUIDA",
        resolucao: opts.resolucao,
        valorReembolso: opts.valorReembolso,
        novoItemVendaId: opts.novoItemVendaId,
        trocaGarantiaFornecedorId: opts.trocaGarantiaFornecedorId,
        resolvidaEm: new Date(),
      },
    });

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
