import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { empresaAtualId, usuarioAtual } from "@/lib/sessao";
import { avaliarMargemItem } from "@/lib/ai/margin-guard";
import type { Prisma } from "@prisma/client";

const itemSchema = z.object({
  produtoId: z.string(),
  quantidade: z.number().positive(),
  precoUnitario: z.number().positive(),
  desconto: z.number().nonnegative().default(0),
});

const pagamentoSchema = z.object({
  formaPagamento: z.enum([
    "DINHEIRO",
    "PIX",
    "DEBITO",
    "CREDITO",
    "CREDIARIO",
    "BOLETO",
    "CHEQUE",
    "VALE_PRESENTE",
    "TRANSFERENCIA",
  ]),
  valor: z.number().positive(),
  parcelas: z.number().int().positive().default(1),
  bandeira: z.string().optional(),
});

const vendaSchema = z.object({
  tipo: z.enum(["VENDA", "ORCAMENTO", "PRE_VENDA"]).default("VENDA"),
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
});

export async function GET() {
  const empresaId = await empresaAtualId();
  const vendas = await prisma.venda.findMany({
    where: { empresaId },
    include: { cliente: true, itens: { include: { produto: true } }, pagamentos: true },
    orderBy: { criadaEm: "desc" },
    take: 50,
  });
  return NextResponse.json(vendas);
}

export async function POST(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const usuario = await usuarioAtual();
  const body = vendaSchema.parse(await req.json());

  // Carrega produtos para validar estoque, margem, preço.
  const produtoIds = body.itens.map((i) => i.produtoId);
  const produtos = await prisma.produto.findMany({
    where: { id: { in: produtoIds } },
    include: { estoques: true },
  });
  const byId = new Map(produtos.map((p) => [p.id, p]));

  let valorBruto = 0;
  let custoTotal = 0;
  const itensPayload: Prisma.ItemVendaCreateWithoutVendaInput[] = body.itens.map((it) => {
    const p = byId.get(it.produtoId);
    if (!p) throw new Error(`Produto ${it.produtoId} não encontrado`);
    const total = it.precoUnitario * it.quantidade - it.desconto;
    valorBruto += it.precoUnitario * it.quantidade;
    custoTotal += Number(p.custoMedio) * it.quantidade;
    const aval = avaliarMargemItem({
      custoUnitario: Number(p.custoMedio),
      precoUnitario: it.precoUnitario,
      precoMinimo: p.precoMinimo ? Number(p.precoMinimo) : undefined,
      margemAlvo: p.margemAlvo ? Number(p.margemAlvo) : undefined,
    });
    return {
      produto: { connect: { id: it.produtoId } },
      quantidade: it.quantidade,
      precoUnitario: it.precoUnitario,
      custoUnitario: Number(p.custoMedio),
      desconto: it.desconto,
      total,
      margem: total - Number(p.custoMedio) * it.quantidade,
      margemAbaixoMinimo: !aval.okay,
    };
  });

  const valorTotal = valorBruto - body.descontoGeral;
  const numero = await proximoNumeroVenda(empresaId);

  const venda = await prisma.$transaction(async (tx) => {
    const v = await tx.venda.create({
      data: {
        empresaId,
        vendedorId: usuario.id,
        clienteId: body.clienteId ?? null,
        veiculoPlaca: body.veiculoPlaca ?? null,
        tipo: body.tipo,
        origem: body.origem,
        status: body.tipo === "ORCAMENTO" ? "ABERTA" : "PAGA",
        numero,
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

    // baixa de estoque (só se for VENDA, não orçamento)
    if (body.tipo === "VENDA") {
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
            origemTipo: "VENDA",
            origemId: v.id,
            documento: `Venda #${numero}`,
          },
        });
      }

      // contas a receber por pagamento parcelado
      for (const p of body.pagamentos) {
        if (p.parcelas > 1) {
          const valorParc = Number((p.valor / p.parcelas).toFixed(2));
          for (let i = 0; i < p.parcelas; i++) {
            const venc = new Date();
            venc.setDate(venc.getDate() + 30 * (i + 1));
            await tx.contaReceber.create({
              data: {
                empresaId,
                clienteId: body.clienteId ?? null,
                vendaId: v.id,
                descricao: `Venda #${numero} parcela ${i + 1}/${p.parcelas}`,
                formaPagamento: p.formaPagamento,
                parcela: i + 1,
                totalParcelas: p.parcelas,
                dataVencimento: venc,
                valor: valorParc,
              },
            });
          }
        }
      }
    }

    return v;
  });

  return NextResponse.json(venda, { status: 201 });
}

async function proximoNumeroVenda(empresaId: string): Promise<number> {
  const ultima = await prisma.venda.findFirst({
    where: { empresaId },
    orderBy: { numero: "desc" },
    select: { numero: true },
  });
  return (ultima?.numero ?? 0) + 1;
}
