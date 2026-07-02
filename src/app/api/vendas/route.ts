import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { avaliarMargemItem } from "@/lib/ai/margin-guard";
import {
  validarDescontoTotal,
  validarPrecoMinimoItem,
} from "@/lib/vendas/politica-desconto";
import { promocoesVigentes, type PromocaoVigente } from "@/lib/vendas/promocoes";
import {
  pagamentoSchema,
  totalCrediario,
  validarCrediario,
  criarContasReceberParceladas,
} from "@/lib/vendas/crediario";
import type { Prisma } from "@prisma/client";

const itemSchema = z.object({
  produtoId: z.string(),
  quantidade: z.number().positive(),
  precoUnitario: z.number().positive(),
  desconto: z.number().nonnegative().default(0),
});

const vendaSchema = z.object({
  tipo: z.enum(["VENDA", "ORCAMENTO", "PRE_VENDA", "CONDICIONAL"]).default("VENDA"),
  clienteId: z.string().optional().nullable(),
  veiculoPlaca: z.string().optional().nullable(),
  origem: z
    .enum([
      "BALCAO",
      "PDV",
      "ECOMMERCE",
      "WHATSAPP",
      "TELEFONE",
      "MARKETPLACE_ML",
      "MARKETPLACE_SHOPEE",
      "MARKETPLACE_AMAZON",
      "MARKETPLACE_MAGALU",
      "EXTERNO",
    ])
    .default("BALCAO"),
  itens: z.array(itemSchema).min(1),
  pagamentos: z.array(pagamentoSchema).default([]),
  descontoGeral: z.number().nonnegative().default(0),
  observacoes: z.string().optional(),
  // Só para tipo CONDICIONAL: prazo de retorno da peça.
  diasRetorno: z.number().int().positive().max(365).optional(),
});

export const GET = comAuth("VENDEDOR", async (_req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const vendas = await prisma.venda.findMany({
    where: { empresaId },
    include: { cliente: true, itens: { include: { produto: true } }, pagamentos: true },
    orderBy: { criadaEm: "desc" },
    take: 50,
  });
  return NextResponse.json(vendas);
});

export const POST = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const body = vendaSchema.parse(await req.json());

  let cliente: {
    id: string;
    bloqueado: boolean;
    limiteCredito: Prisma.Decimal;
    saldoDevedor: Prisma.Decimal;
  } | null = null;
  if (body.clienteId) {
    cliente = await prisma.cliente.findFirst({
      where: { id: body.clienteId, empresaId },
      select: { id: true, bloqueado: true, limiteCredito: true, saldoDevedor: true },
    });
    if (!cliente) throw new ApiError(404, "Cliente não encontrado");
    if (cliente.bloqueado) {
      throw new ApiError(422, "Cliente bloqueado por inadimplência — venda não permitida.");
    }
  }

  // Crediário: exige cliente identificado e limite disponível.
  const valorCrediario = totalCrediario(body.pagamentos);
  if (valorCrediario > 0) validarCrediario(cliente, valorCrediario);

  // Carrega produtos para validar estoque, margem, preço.
  const produtoIds = body.itens.map((i) => i.produtoId);
  const [produtos, promocoes] = await Promise.all([
    prisma.produto.findMany({
      where: { id: { in: produtoIds }, empresaId },
      include: { estoques: true },
    }),
    promocoesVigentes(empresaId, produtoIds),
  ]);
  const byId = new Map(produtos.map((p) => [p.id, p]));

  let valorBruto = 0;
  let custoTotal = 0;
  let descontoItens = 0;
  const promocoesAplicadas: Array<
    PromocaoVigente & { precoEnviado: number }
  > = [];
  const itensPayload: Prisma.ItemVendaCreateWithoutVendaInput[] = body.itens.map((it) => {
    const p = byId.get(it.produtoId);
    if (!p) throw new Error(`Produto ${it.produtoId} não encontrado`);

    // Promoção automática: nunca aumenta preço — só aplica se for menor.
    let precoUnitario = it.precoUnitario;
    const promo = promocoes.get(it.produtoId);
    if (promo && promo.precoPromocional > 0 && precoUnitario > promo.precoPromocional) {
      promocoesAplicadas.push({ ...promo, precoEnviado: precoUnitario });
      precoUnitario = promo.precoPromocional;
    }

    // Preço mínimo: abaixo dele, só GERENTE ou acima.
    const precoEfetivo = precoUnitario - (it.quantidade > 0 ? it.desconto / it.quantidade : 0);
    validarPrecoMinimoItem({
      perfil: usuario.perfil,
      produtoNome: p.nome,
      precoEfetivo,
      precoMinimo: p.precoMinimo ? Number(p.precoMinimo) : null,
    });

    const total = precoUnitario * it.quantidade - it.desconto;
    valorBruto += precoUnitario * it.quantidade;
    custoTotal += Number(p.custoMedio) * it.quantidade;
    descontoItens += it.desconto;
    const aval = avaliarMargemItem({
      custoUnitario: Number(p.custoMedio),
      precoUnitario,
      precoMinimo: p.precoMinimo ? Number(p.precoMinimo) : undefined,
      margemAlvo: p.margemAlvo ? Number(p.margemAlvo) : undefined,
    });
    return {
      produto: { connect: { id: it.produtoId } },
      quantidade: it.quantidade,
      precoUnitario,
      custoUnitario: Number(p.custoMedio),
      desconto: it.desconto,
      total,
      margem: total - Number(p.custoMedio) * it.quantidade,
      margemAbaixoMinimo: !aval.okay,
    };
  });

  // Trava de desconto por perfil: desconto total (geral + itens) sobre o bruto.
  validarDescontoTotal({
    perfil: usuario.perfil,
    valorBruto,
    descontoTotal: body.descontoGeral + descontoItens,
  });

  const valorTotal = valorBruto - body.descontoGeral;
  const numero = await proximoNumeroVenda(empresaId);
  const ehCondicional = body.tipo === "CONDICIONAL";
  const baixaEstoque = body.tipo === "VENDA" || ehCondicional;
  const condicionalRetornoEm = ehCondicional
    ? new Date(Date.now() + (body.diasRetorno ?? 7) * 24 * 3600 * 1000)
    : null;

  const venda = await prisma.$transaction(async (tx) => {
    const v = await tx.venda.create({
      data: {
        empresaId,
        vendedorId: usuario.id,
        clienteId: body.clienteId ?? null,
        veiculoPlaca: body.veiculoPlaca ?? null,
        tipo: body.tipo,
        origem: body.origem,
        status: body.tipo === "ORCAMENTO" || ehCondicional ? "ABERTA" : "PAGA",
        numero,
        condicionalRetornoEm,
        valorBruto,
        valorDesconto: body.descontoGeral,
        valorTotal,
        custoTotal,
        margemBruta: valorTotal - custoTotal,
        margemPercent: valorTotal > 0 ? (valorTotal - custoTotal) / valorTotal : 0,
        observacoes: body.observacoes,
        itens: { create: itensPayload },
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

    // baixa de estoque (venda normal e condicional; orçamento não baixa)
    if (baixaEstoque) {
      for (const it of body.itens) {
        const p = byId.get(it.produtoId)!;
        const dep = p.estoques.find((e) => Number(e.quantidade) >= it.quantidade) ?? p.estoques[0];
        if (!dep) continue;
        await tx.estoqueDeposito.update({
          where: { id: dep.id },
          data: { quantidade: { decrement: it.quantidade } },
        });
        await tx.movimentoEstoque.create({
          data: {
            produtoId: it.produtoId,
            depositoId: dep.depositoId,
            tipo: "SAIDA",
            quantidade: it.quantidade,
            custoUnitario: Number(p.custoMedio),
            origemTipo: ehCondicional ? "CONDICIONAL" : "VENDA",
            origemId: v.id,
            documento: `${ehCondicional ? "Condicional" : "Venda"} #${numero}`,
          },
        });
      }
    }

    if (body.tipo === "VENDA") {
      // contas a receber por pagamento parcelado
      await criarContasReceberParceladas(tx, {
        empresaId,
        clienteId: body.clienteId ?? null,
        vendaId: v.id,
        numeroVenda: numero,
        pagamentos: body.pagamentos,
      });

      // crediário consome limite do cliente
      if (valorCrediario > 0 && cliente) {
        await tx.cliente.update({
          where: { id: cliente.id },
          data: { saldoDevedor: { increment: valorCrediario } },
        });
      }
    }

    return v;
  });

  return NextResponse.json({ ...venda, promocoesAplicadas }, { status: 201 });
});

async function proximoNumeroVenda(empresaId: string): Promise<number> {
  const ultima = await prisma.venda.findFirst({
    where: { empresaId },
    orderBy: { numero: "desc" },
    select: { numero: true },
  });
  return (ultima?.numero ?? 0) + 1;
}
