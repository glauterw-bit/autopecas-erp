import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import {
  pagamentoSchema,
  totalCrediario,
  validarCrediario,
  criarContasReceberParceladas,
  consumirLimiteCrediario,
} from "@/lib/vendas/crediario";

// Fechamento de venda CONDICIONAL
// ===============================
// { acao: "faturar", pagamentos: [...] } → cliente ficou com as peças:
//   tipo vira VENDA, status PAGA, registra pagamentos/contas a receber.
//   Estoque já foi baixado na criação da condicional — não baixa de novo.
// { acao: "devolver", itens?: [{ itemVendaId, quantidade }] } → devolve
//   tudo (sem itens) ou parcial, estornando estoque (ENTRADA com
//   origemTipo CONDICIONAL_DEVOLUCAO). Devolveu tudo → status CANCELADA.

const bodySchema = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("faturar"),
    pagamentos: z.array(pagamentoSchema).default([]),
  }),
  z.object({
    acao: z.literal("devolver"),
    itens: z
      .array(
        z.object({
          itemVendaId: z.string(),
          quantidade: z.number().positive(),
        }),
      )
      .min(1)
      .optional(),
  }),
]);

type Ctx = { params: Promise<{ id: string }> };

export const POST = comAuth<Ctx>("VENDEDOR", async (req, ctx, usuario) => {
  const { id } = await ctx.params;
  const body = bodySchema.parse(await req.json());

  const venda = await prisma.venda.findFirst({
    where: { id, empresaId: usuario.empresaId },
    include: {
      itens: true,
      cliente: {
        select: { id: true, bloqueado: true, limiteCredito: true, saldoDevedor: true },
      },
    },
  });
  if (!venda) throw new ApiError(404, "Venda não encontrada");
  if (venda.tipo !== "CONDICIONAL") {
    throw new ApiError(422, "Esta venda não é uma condicional.");
  }
  if (venda.status !== "ABERTA") {
    throw new ApiError(422, `Condicional já fechada (status ${venda.status}).`);
  }

  if (body.acao === "faturar") {
    const valorCrediario = totalCrediario(body.pagamentos);
    if (valorCrediario > 0) validarCrediario(venda.cliente, valorCrediario);

    // A2: a condicional só vira VENDA PAGA se os pagamentos cobrirem o total
    // (CREDIARIO conta como cobertura — é a modalidade a prazo).
    const somaPagamentos = body.pagamentos.reduce((a, p) => a + p.valor, 0);
    const totalVenda = Number(venda.valorTotal);
    if (Math.abs(somaPagamentos - totalVenda) > 0.01) {
      throw new ApiError(
        422,
        `Pagamentos (R$ ${somaPagamentos.toFixed(2)}) não cobrem o total da venda (R$ ${totalVenda.toFixed(2)}).`,
      );
    }

    // Sessão de caixa aberta do usuário: carimba o vínculo venda↔sessão.
    const sessaoCaixa = await prisma.sessaoCaixa.findFirst({
      where: {
        usuarioId: usuario.id,
        fechadaEm: null,
        caixa: { filial: { empresaId: usuario.empresaId } },
      },
      orderBy: { abertaEm: "asc" },
      select: { id: true },
    });

    const atualizada = await prisma.$transaction(async (tx) => {
      const v = await tx.venda.update({
        where: { id: venda.id },
        data: {
          tipo: "VENDA",
          status: "PAGA",
          fechadaEm: new Date(),
          ...(sessaoCaixa ? { sessaoCaixaId: sessaoCaixa.id } : {}),
          pagamentos: {
            create: body.pagamentos.map((p) => ({
              formaPagamento: p.formaPagamento,
              valor: p.valor,
              parcelas: p.parcelas,
              bandeira: p.bandeira,
            })),
          },
        },
        include: { itens: true, pagamentos: true },
      });

      await criarContasReceberParceladas(tx, {
        empresaId: venda.empresaId,
        clienteId: venda.clienteId,
        vendaId: venda.id,
        numeroVenda: venda.numero,
        pagamentos: body.pagamentos,
      });

      // C3: incremento condicional + revalidação do limite dentro da transação.
      if (valorCrediario > 0 && venda.clienteId) {
        await consumirLimiteCrediario(tx, venda.clienteId, valorCrediario);
      }

      return v;
    });

    return NextResponse.json(atualizada);
  }

  // --- acao === "devolver" ------------------------------------------------
  // Sem itens no body → devolução total.
  const devolucoes = new Map<string, number>(); // itemVendaId → quantidade
  if (body.itens) {
    for (const d of body.itens) {
      const item = venda.itens.find((i) => i.id === d.itemVendaId);
      if (!item) throw new ApiError(422, `Item ${d.itemVendaId} não pertence a esta venda.`);
      const qtdAtual = Number(item.quantidade);
      const jaMarcado = devolucoes.get(d.itemVendaId) ?? 0;
      if (jaMarcado + d.quantidade > qtdAtual + 0.0005) {
        throw new ApiError(
          422,
          `Quantidade a devolver (${jaMarcado + d.quantidade}) maior que a quantidade em condicional (${qtdAtual}).`,
        );
      }
      devolucoes.set(d.itemVendaId, jaMarcado + d.quantidade);
    }
  } else {
    for (const item of venda.itens) {
      const qtd = Number(item.quantidade);
      if (qtd > 0) devolucoes.set(item.id, qtd);
    }
  }
  if (devolucoes.size === 0) throw new ApiError(422, "Nada a devolver.");

  // Deposito de origem: o mesmo da SAIDA registrada na criação da condicional.
  const saidas = await prisma.movimentoEstoque.findMany({
    where: { origemId: venda.id, origemTipo: "CONDICIONAL", tipo: "SAIDA" },
    select: { produtoId: true, depositoId: true },
  });
  const depositoPorProduto = new Map(saidas.map((m) => [m.produtoId, m.depositoId]));

  const atualizada = await prisma.$transaction(async (tx) => {
    // B2: decremento condicional — duas devoluções concorrentes do mesmo item
    // não podem estornar em dobro. Se a quantidade já foi devolvida por outra
    // requisição, count === 0 e a transação aborta com 409.
    for (const [itemVendaId, devolver] of devolucoes) {
      const upd = await tx.itemVenda.updateMany({
        where: { id: itemVendaId, vendaId: venda.id, quantidade: { gte: devolver } },
        data: { quantidade: { decrement: devolver } },
      });
      if (upd.count === 0) {
        throw new ApiError(409, "quantidade já devolvida");
      }
    }

    // Estorno de estoque. B3: sem SAIDA registrada (venda antiga com baixa
    // pulada), estorna via upsert no primeiro depósito da empresa.
    let depositoFallbackId: string | null | undefined;
    for (const [itemVendaId, devolver] of devolucoes) {
      const item = venda.itens.find((i) => i.id === itemVendaId)!;
      let depositoId = depositoPorProduto.get(item.produtoId);
      if (!depositoId) {
        if (depositoFallbackId === undefined) {
          const dep = await tx.deposito.findFirst({
            where: { empresaId: venda.empresaId, ativo: true },
            select: { id: true },
          });
          depositoFallbackId = dep?.id ?? null;
        }
        depositoId = depositoFallbackId ?? undefined;
      }
      if (!depositoId) continue; // empresa sem nenhum depósito cadastrado
      await tx.estoqueDeposito.upsert({
        where: { produtoId_depositoId: { produtoId: item.produtoId, depositoId } },
        update: { quantidade: { increment: devolver } },
        create: { produtoId: item.produtoId, depositoId, quantidade: devolver },
      });
      await tx.movimentoEstoque.create({
        data: {
          produtoId: item.produtoId,
          depositoId,
          tipo: "ENTRADA",
          quantidade: devolver,
          custoUnitario: item.custoUnitario,
          origemTipo: "CONDICIONAL_DEVOLUCAO",
          origemId: venda.id,
          documento: `Devolução condicional #${venda.numero}`,
        },
      });
    }

    // Recalcula totais a partir dos itens RELIDOS dentro da transação.
    const itensAtuais = await tx.itemVenda.findMany({ where: { vendaId: venda.id } });

    // A1: venda.valorDesconto = descontoGeral + descontos de item; recupera o
    // geral subtraindo os descontos de item originais.
    const descontoItensOriginais = venda.itens.reduce((a, i) => a + Number(i.desconto), 0);
    const descontoGeral = Math.max(0, Number(venda.valorDesconto) - descontoItensOriginais);

    let valorBruto = 0;
    let custoTotal = 0;
    let descontoItens = 0;
    let tudoDevolvido = true;

    for (const item of itensAtuais) {
      const novaQtd = Number(item.quantidade);
      const devolvidoAgora = devolucoes.get(item.id) ?? 0;
      const preco = Number(item.precoUnitario);
      const custo = Number(item.custoUnitario);
      let desconto = Number(item.desconto);

      if (devolvidoAgora > 0) {
        // B5: rateia o desconto do item pela quantidade que permaneceu.
        const qtdAntes = novaQtd + devolvidoAgora;
        desconto =
          qtdAntes > 0 ? Number(((desconto * novaQtd) / qtdAntes).toFixed(2)) : 0;
        const novoTotal = Math.max(0, preco * novaQtd - desconto);
        await tx.itemVenda.update({
          where: { id: item.id },
          data: {
            desconto,
            total: novoTotal,
            margem: novoTotal - custo * novaQtd,
          },
        });
      }

      if (novaQtd > 0) tudoDevolvido = false;
      valorBruto += preco * novaQtd;
      custoTotal += custo * novaQtd;
      descontoItens += desconto;
    }

    // A1: total desconta o desconto (rateado) dos itens + o desconto geral.
    const valorDesconto = tudoDevolvido ? 0 : descontoGeral + descontoItens;
    const valorTotal = Math.max(0, valorBruto - valorDesconto);
    return tx.venda.update({
      where: { id: venda.id },
      data: {
        valorBruto,
        valorDesconto,
        valorTotal,
        custoTotal,
        margemBruta: valorTotal - custoTotal,
        margemPercent: valorTotal > 0 ? (valorTotal - custoTotal) / valorTotal : 0,
        ...(tudoDevolvido
          ? {
              status: "CANCELADA",
              canceladaEm: new Date(),
              motivoCancelamento: "Condicional devolvida integralmente",
            }
          : {}),
      },
      include: { itens: true, pagamentos: true },
    });
  });

  return NextResponse.json(atualizada);
});
