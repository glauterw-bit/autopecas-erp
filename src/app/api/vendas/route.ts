import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { avaliarMargemItem } from "@/lib/ai/margin-guard";
import {
  validarDescontoTotal,
  descontoAcimaDaPolitica,
  validarPrecoMinimoItem,
} from "@/lib/vendas/politica-desconto";
import { promocoesVigentes, type PromocaoVigente } from "@/lib/vendas/promocoes";
import {
  pagamentoSchema,
  totalCrediario,
  validarCrediario,
  criarContasReceberParceladas,
  consumirLimiteCrediario,
} from "@/lib/vendas/crediario";
import { registrarAuditoria } from "@/lib/auth/auditoria";
import { Prisma } from "@prisma/client";

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
  let valorBrutoCatalogo = 0;
  let descontoEfetivoItens = 0;
  const itensAbaixoDoMinimo: Array<{ sku: string; precoEfetivo: number; precoMinimo: number }> = [];
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

    // E1: a base da trava de desconto é o preço de CATÁLOGO (promocional
    // vigente ?? precoVenda), nunca o preço enviado pelo cliente — senão a
    // trava é contornável baixando o precoUnitario. Preço enviado acima do
    // catálogo não gera desconto negativo (clamp em 0).
    const precoCatalogo =
      promo && promo.precoPromocional > 0
        ? promo.precoPromocional
        : p.precoPromocional && Number(p.precoPromocional) > 0
          ? Number(p.precoPromocional)
          : Number(p.precoVenda);
    valorBrutoCatalogo += precoCatalogo * it.quantidade;
    descontoEfetivoItens +=
      Math.max(0, precoCatalogo - precoUnitario) * it.quantidade + it.desconto;

    // Preço mínimo: abaixo dele, só GERENTE ou acima.
    // E2: se o preço efetivo é EXATAMENTE o promocional vigente aplicado
    // pelo servidor, a promoção não pode bloquear o vendedor.
    const precoEfetivo = precoUnitario - (it.quantidade > 0 ? it.desconto / it.quantidade : 0);
    const precoEhPromocionalVigente =
      !!promo &&
      promo.precoPromocional > 0 &&
      Math.abs(precoEfetivo - promo.precoPromocional) <= 0.005;
    if (
      !precoEhPromocionalVigente &&
      p.precoMinimo &&
      precoEfetivo < Number(p.precoMinimo) - 0.005
    ) {
      itensAbaixoDoMinimo.push({
        sku: p.sku,
        precoEfetivo: Math.round(precoEfetivo * 100) / 100,
        precoMinimo: Number(p.precoMinimo),
      });
    }
    if (!precoEhPromocionalVigente) {
      validarPrecoMinimoItem({
        perfil: usuario.perfil,
        produtoNome: p.nome,
        precoEfetivo,
        precoMinimo: p.precoMinimo ? Number(p.precoMinimo) : null,
      });
    }

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

  // Trava de desconto por perfil (E1): desconto efetivo (diferença para o
  // preço de catálogo + descontos de item + geral) sobre o bruto de catálogo.
  validarDescontoTotal({
    perfil: usuario.perfil,
    valorBruto: valorBrutoCatalogo,
    descontoTotal: body.descontoGeral + descontoEfetivoItens,
  });

  const descontoTotalEfetivo = body.descontoGeral + descontoEfetivoItens;
  const auditarDesconto =
    descontoAcimaDaPolitica({ valorBruto: valorBrutoCatalogo, descontoTotal: descontoTotalEfetivo }) ||
    itensAbaixoDoMinimo.length > 0;

  // A1: o total desconta TAMBÉM os descontos de item, não só o geral.
  const valorDesconto = body.descontoGeral + descontoItens;
  const valorTotal = valorBruto - valorDesconto;

  // A2/A3: uma VENDA só nasce PAGA se os pagamentos cobrirem exatamente o
  // total (CREDIARIO conta como cobertura — é a modalidade a prazo). Quando a
  // promoção reduziu o total depois do PDV cotar, devolvemos o novo total e
  // as promoções aplicadas para o cliente recotar.
  if (body.tipo === "VENDA") {
    const somaPagamentos = body.pagamentos.reduce((a, p) => a + p.valor, 0);
    if (Math.abs(somaPagamentos - valorTotal) > 0.01) {
      return NextResponse.json(
        {
          erro: `Pagamentos (R$ ${somaPagamentos.toFixed(2)}) não cobrem o total da venda (R$ ${valorTotal.toFixed(2)}).`,
          valorTotal,
          promocoes: promocoesAplicadas,
        },
        { status: 422 },
      );
    }
  }

  const ehCondicional = body.tipo === "CONDICIONAL";
  const baixaEstoque = body.tipo === "VENDA" || ehCondicional;
  const condicionalRetornoEm = ehCondicional
    ? new Date(Date.now() + (body.diasRetorno ?? 7) * 24 * 3600 * 1000)
    : null;

  // Sessão de caixa aberta do usuário: carimba o vínculo venda↔sessão.
  const sessaoCaixa =
    body.tipo === "VENDA"
      ? await prisma.sessaoCaixa.findFirst({
          where: {
            usuarioId: usuario.id,
            fechadaEm: null,
            caixa: { filial: { empresaId: usuario.empresaId } },
          },
          orderBy: { abertaEm: "asc" },
          select: { id: true },
        })
      : null;

  // A4: o número da venda é calculado fora de lock — sob concorrência o
  // unique (empresaId, numero) pode estourar P2002. Recalcula e re-tenta
  // até 3 vezes, apenas quando o conflito for do campo `numero`.
  let venda: Prisma.VendaGetPayload<{ include: { itens: true; pagamentos: true } }> | null =
    null;
  for (let tentativa = 1; tentativa <= 3 && !venda; tentativa++) {
    const numero = await proximoNumeroVenda(empresaId);
    try {
      venda = await prisma.$transaction(async (tx) => {
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
            sessaoCaixaId: sessaoCaixa?.id ?? null,
            condicionalRetornoEm,
            valorBruto,
            valorDesconto,
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

        // Desconto acima da política do balcão (ou abaixo do preço mínimo,
        // liberado por gerente/admin) fica registrado com antes e depois.
        if (auditarDesconto) {
          await registrarAuditoria(tx, {
            empresaId,
            usuarioId: usuario.id,
            acao: "VENDA_DESCONTO_ACIMA_POLITICA",
            entidade: "Venda",
            entidadeId: v.id,
            antes: { valorBrutoCatalogo: valorBrutoCatalogo.toFixed(2), descontoPolitica: "ate 5%" },
            depois: {
              numero,
              perfil: usuario.perfil,
              descontoTotal: descontoTotalEfetivo.toFixed(2),
              percentual: ((descontoTotalEfetivo / valorBrutoCatalogo) * 100).toFixed(1),
              itensAbaixoDoMinimo,
            },
          });
        }

        // baixa de estoque (venda normal e condicional; orçamento não baixa)
        // B3: nunca pula a baixa em silêncio — sem saldo suficiente, ou o
        // produto permite venda sem estoque (linha pode ficar negativa) ou
        // a venda é recusada com 422.
        if (baixaEstoque) {
          let depositoFallbackId: string | null = null;
          for (const it of body.itens) {
            const p = byId.get(it.produtoId)!;
            const dep = p.estoques.find((e) => Number(e.quantidade) >= it.quantidade);
            let depositoId: string;
            if (dep) {
              depositoId = dep.depositoId;
              await tx.estoqueDeposito.update({
                where: { id: dep.id },
                data: { quantidade: { decrement: it.quantidade } },
              });
            } else if (p.permiteVendaSemEstoque) {
              // Sem saldo suficiente: decrementa a linha existente (fica
              // negativa) ou faz upsert no primeiro depósito da empresa.
              const existente = p.estoques[0];
              if (existente) {
                depositoId = existente.depositoId;
                await tx.estoqueDeposito.update({
                  where: { id: existente.id },
                  data: { quantidade: { decrement: it.quantidade } },
                });
              } else {
                if (!depositoFallbackId) {
                  const deposito = await tx.deposito.findFirst({
                    where: { empresaId, ativo: true },
                    select: { id: true },
                  });
                  if (!deposito) {
                    throw new ApiError(
                      422,
                      `Produto ${p.nome} sem estoque disponível (nenhum depósito cadastrado).`,
                    );
                  }
                  depositoFallbackId = deposito.id;
                }
                depositoId = depositoFallbackId;
                await tx.estoqueDeposito.upsert({
                  where: {
                    produtoId_depositoId: { produtoId: it.produtoId, depositoId },
                  },
                  update: { quantidade: { decrement: it.quantidade } },
                  create: {
                    produtoId: it.produtoId,
                    depositoId,
                    quantidade: -it.quantidade,
                  },
                });
              }
            } else {
              throw new ApiError(422, `Produto ${p.nome} sem estoque disponível`);
            }
            await tx.movimentoEstoque.create({
              data: {
                produtoId: it.produtoId,
                depositoId,
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
          // contas a receber por pagamento parcelado / crediário / boleto
          await criarContasReceberParceladas(tx, {
            empresaId,
            clienteId: body.clienteId ?? null,
            vendaId: v.id,
            numeroVenda: numero,
            pagamentos: body.pagamentos,
          });

          // C3: crediário consome limite do cliente de forma atômica — o
          // incremento é condicional e o limite é revalidado na transação.
          if (valorCrediario > 0 && cliente) {
            await consumirLimiteCrediario(tx, cliente.id, valorCrediario);
          }
        }

        return v;
      });
    } catch (e) {
      if (ehConflitoNumeroVenda(e)) {
        if (tentativa === 3) {
          throw new ApiError(
            409,
            "Não foi possível gerar o número da venda (concorrência). Tente novamente.",
          );
        }
        continue;
      }
      throw e;
    }
  }
  if (!venda) throw new ApiError(500, "Falha ao registrar a venda.");

  return NextResponse.json({ ...venda, promocoesAplicadas }, { status: 201 });
});

/** P2002 do unique (empresaId, numero) — e só dele (existe também unique em externoId). */
function ehConflitoNumeroVenda(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") {
    return false;
  }
  const target = e.meta?.target;
  const campos = Array.isArray(target) ? target.map(String) : [String(target ?? "")];
  return campos.some((c) => c.includes("numero"));
}

async function proximoNumeroVenda(empresaId: string): Promise<number> {
  const ultima = await prisma.venda.findFirst({
    where: { empresaId },
    orderBy: { numero: "desc" },
    select: { numero: true },
  });
  return (ultima?.numero ?? 0) + 1;
}
