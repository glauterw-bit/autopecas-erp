import { prisma } from "../db";

// Recebimento físico de uma NotaEntrada
// =====================================
// Passo que faltava entre "importar XML" e o estoque real:
// 1) dá entrada da quantidade no depósito padrão da empresa
// 2) registra MovimentoEstoque ENTRADA (kardex)
// 3) atualiza custoUltimaCompra e recalcula custoMedio ponderado —
//    sem isso a margem de toda venda futura sai errada.
// Idempotente: uma nota só pode ser recebida uma vez.

export async function receberNotaEntrada(opts: { empresaId: string; notaId: string }) {
  const nota = await prisma.notaEntrada.findFirst({
    where: { id: opts.notaId, fornecedor: { empresaId: opts.empresaId } },
    include: { itens: true, fornecedor: { select: { empresaId: true, nomeFantasia: true } } },
  });
  if (!nota) throw new Error("Nota de entrada não encontrada");

  const jaRecebida = await prisma.movimentoEstoque.findFirst({
    where: { origemTipo: "ENTRADA_NF", origemId: nota.id },
    select: { id: true },
  });
  if (jaRecebida) throw new Error("Esta nota já foi recebida no estoque");

  const itensComProduto = nota.itens.filter((i) => i.produtoId);
  if (itensComProduto.length === 0) {
    throw new Error("Nenhum item da nota tem produto vinculado — faça o match antes de receber");
  }

  const deposito =
    (await prisma.deposito.findFirst({
      where: { empresaId: opts.empresaId, tipo: "LOJA" },
      select: { id: true },
    })) ??
    (await prisma.deposito.create({
      data: { empresaId: opts.empresaId, nome: "Depósito principal", tipo: "LOJA" },
      select: { id: true },
    }));

  let itensRecebidos = 0;
  await prisma.$transaction(async (tx) => {
    for (const item of itensComProduto) {
      const produtoId = item.produtoId!;
      const qtd = Number(item.quantidade);
      const custoUnit = Number(item.valorUnitario);

      // Estoque total ANTES da entrada (todos os depósitos) para o custo médio
      const estoques = await tx.estoqueDeposito.findMany({
        where: { produtoId },
        select: { quantidade: true },
      });
      const estoqueAtual = estoques.reduce((s, e) => s + Number(e.quantidade), 0);

      await tx.estoqueDeposito.upsert({
        where: { produtoId_depositoId: { produtoId, depositoId: deposito.id } },
        create: { produtoId, depositoId: deposito.id, quantidade: qtd },
        update: { quantidade: { increment: qtd } },
      });

      await tx.movimentoEstoque.create({
        data: {
          produtoId,
          depositoId: deposito.id,
          tipo: "ENTRADA",
          quantidade: qtd,
          custoUnitario: custoUnit,
          origemTipo: "ENTRADA_NF",
          origemId: nota.id,
          documento: `NF ${nota.numero}/${nota.serie} — ${nota.fornecedor.nomeFantasia ?? "fornecedor"}`,
        },
      });

      // Custo médio ponderado: (estoque × custoMedio + qtd × custoNota) / (estoque + qtd)
      const produto = await tx.produto.findUniqueOrThrow({
        where: { id: produtoId },
        select: { custoMedio: true },
      });
      const custoMedioAtual = Number(produto.custoMedio);
      const base = Math.max(estoqueAtual, 0);
      const novoCustoMedio =
        base + qtd > 0
          ? (base * custoMedioAtual + qtd * custoUnit) / (base + qtd)
          : custoUnit;

      await tx.produto.update({
        where: { id: produtoId },
        data: {
          custoMedio: Number(novoCustoMedio.toFixed(4)),
          custoUltimaCompra: custoUnit,
        },
      });
      itensRecebidos++;
    }
  });

  return {
    notaId: nota.id,
    itensRecebidos,
    itensSemVinculo: nota.itens.length - itensComProduto.length,
  };
}
