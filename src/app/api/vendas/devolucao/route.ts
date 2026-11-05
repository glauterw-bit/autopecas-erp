import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { STATUS_VENDA_FATURADA } from "@/lib/vendas/venda-faturada";
import {
  MOTIVOS_RETORNO,
  RetornoInvalido,
  ROTULO_MOTIVO_RETORNO,
  marcaRevisaoCadastro,
  validarRetorno,
  vendaTotalmenteDevolvida,
  voltaEstoquePadrao,
} from "@/lib/crm/retorno";
import { registrarAuditoria } from "@/lib/crm/auditoria";

// Devolução de venda com motivo obrigatório
// =========================================
// GET  ?numero=123 (VENDEDOR): venda faturada com saldo devolvível por item.
// POST (VENDEDOR): { vendaId, motivo, itens?: [{ itemVendaId, quantidade }], observacao? }
//   - motivo obrigatório (ERRO_CADASTRO | ERRO_BALCAO | GARANTIA_DEFEITO | DESISTENCIA);
//   - volta ao estoque pelo kardex (ENTRADA, origemTipo DEVOLUCAO), exceto
//     garantia/defeito, que não volta ao estoque vendável;
//   - ERRO_CADASTRO marca o produto para revisão de cadastro;
//   - tudo devolvido → venda DEVOLVIDA; grava LogAuditoria.
// NÃO emite NF-e de devolução nem estorna dinheiro: isso segue pelo fiscal
// (nota de devolução referenciando o item) e pelo financeiro/RMA.

async function carregarVenda(empresaId: string, where: { id?: string; numero?: number }) {
  const venda = await prisma.venda.findFirst({
    where: { empresaId, ...where },
    include: {
      cliente: { select: { id: true, nome: true } },
      itens: { include: { produto: { select: { id: true, sku: true, nome: true } } } },
    },
  });
  if (!venda) throw new ApiError(404, "Venda não encontrada");
  const retornos = await prisma.retornoVenda.groupBy({
    by: ["itemVendaId"],
    // Volta de condicional (origem CONDICIONAL) já reduziu a quantidade do item.
    where: { empresaId, vendaId: venda.id, origem: "VENDA" },
    _sum: { quantidade: true },
  });
  const jaDevolvido = new Map(retornos.map((r) => [r.itemVendaId, Number(r._sum.quantidade ?? 0)]));
  return { venda, jaDevolvido };
}

export const GET = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  const numero = Number(req.nextUrl.searchParams.get("numero"));
  if (!Number.isInteger(numero) || numero <= 0) throw new ApiError(400, "Informe o número da venda.");
  const { venda, jaDevolvido } = await carregarVenda(usuario.empresaId, { numero });
  return NextResponse.json({
    id: venda.id,
    numero: venda.numero,
    tipo: venda.tipo,
    status: venda.status,
    criadaEm: venda.criadaEm,
    cliente: venda.cliente,
    podeDevolver:
      venda.tipo === "VENDA" && (STATUS_VENDA_FATURADA as readonly string[]).includes(venda.status),
    itens: venda.itens.map((i) => ({
      id: i.id,
      produto: i.produto,
      quantidade: Number(i.quantidade),
      precoUnitario: Number(i.precoUnitario),
      jaDevolvido: jaDevolvido.get(i.id) ?? 0,
    })),
    motivos: MOTIVOS_RETORNO.map((m) => ({ valor: m, rotulo: ROTULO_MOTIVO_RETORNO[m] })),
  });
});

const postSchema = z.object({
  vendaId: z.string().min(1),
  motivo: z.string().optional().nullable(),
  itens: z.array(z.object({ itemVendaId: z.string(), quantidade: z.number().positive() })).optional(),
  observacao: z.string().trim().max(500).optional(),
});

export const POST = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const body = postSchema.parse(await req.json());
  const { venda, jaDevolvido } = await carregarVenda(empresaId, { id: body.vendaId });
  if (venda.tipo !== "VENDA" || !(STATUS_VENDA_FATURADA as readonly string[]).includes(venda.status)) {
    throw new ApiError(422, `Só dá para devolver venda concluída (esta está ${venda.status.toLowerCase()}).`);
  }
  const itensVenda = venda.itens.map((i) => ({
    id: i.id,
    produtoId: i.produtoId,
    quantidade: Number(i.quantidade),
    jaDevolvido: jaDevolvido.get(i.id) ?? 0,
  }));
  let validado: ReturnType<typeof validarRetorno>;
  try {
    validado = validarRetorno({ motivo: body.motivo, itens: body.itens, itensVenda });
  } catch (e) {
    if (e instanceof RetornoInvalido) throw new ApiError(422, e.message);
    throw e;
  }
  const { motivo, itens } = validado;
  const voltaEstoque = voltaEstoquePadrao(motivo);
  const devolvidoAgora = new Map(itens.map((i) => [i.item.id, i.quantidade]));
  const totalmente = vendaTotalmenteDevolvida(itensVenda, devolvidoAgora);

  const resultado = await prisma.$transaction(async (tx) => {
    // Revalida dentro da transação contra devolução concorrente do mesmo item.
    for (const { item, quantidade } of itens) {
      const soma = await tx.retornoVenda.aggregate({
        where: { empresaId, itemVendaId: item.id, origem: "VENDA" },
        _sum: { quantidade: true },
      });
      if (Number(soma._sum.quantidade ?? 0) + quantidade > item.quantidade + 1e-9) {
        throw new ApiError(409, "Outro retorno deste item foi registrado agora. Recarregue a venda.");
      }
    }

    const deposito = voltaEstoque
      ? await tx.deposito.findFirst({ where: { empresaId, ativo: true }, select: { id: true } })
      : null;
    if (voltaEstoque && !deposito) throw new ApiError(422, "Nenhum depósito ativo para receber a peça.");

    const criados = [];
    for (const { item, quantidade } of itens) {
      const r = await tx.retornoVenda.create({
        data: {
          empresaId,
          vendaId: venda.id,
          itemVendaId: item.id,
          produtoId: item.produtoId,
          origem: "VENDA",
          quantidade,
          motivo,
          voltaEstoque,
          observacao: body.observacao,
          usuarioId: usuario.id,
        },
      });
      criados.push(r);

      if (voltaEstoque && deposito) {
        // Volta ao depósito de onde saiu (kardex da venda), senão ao primeiro ativo.
        const saida = await tx.movimentoEstoque.findFirst({
          where: { produtoId: item.produtoId, origemId: venda.id, tipo: "SAIDA" },
          select: { depositoId: true, custoUnitario: true },
        });
        const depositoId = saida?.depositoId ?? deposito.id;
        const antes = await tx.estoqueDeposito.findUnique({
          where: { produtoId_depositoId: { produtoId: item.produtoId, depositoId } },
          select: { quantidade: true },
        });
        await tx.estoqueDeposito.upsert({
          where: { produtoId_depositoId: { produtoId: item.produtoId, depositoId } },
          update: { quantidade: { increment: quantidade } },
          create: { produtoId: item.produtoId, depositoId, quantidade },
        });
        await tx.movimentoEstoque.create({
          data: {
            produtoId: item.produtoId,
            depositoId,
            tipo: "ENTRADA",
            quantidade,
            custoUnitario: saida?.custoUnitario ?? undefined,
            origemTipo: "DEVOLUCAO",
            origemId: r.id,
            documento: `Devolução venda #${venda.numero} (${ROTULO_MOTIVO_RETORNO[motivo]})`,
          },
        });
        await registrarAuditoria(tx, {
          usuarioId: usuario.id,
          acao: "ESTOQUE_DEVOLUCAO",
          entidade: "Produto",
          entidadeId: item.produtoId,
          antes: { depositoId, quantidade: Number(antes?.quantidade ?? 0) },
          depois: { depositoId, quantidade: Number(antes?.quantidade ?? 0) + quantidade, retornoId: r.id },
        });
      }

      if (marcaRevisaoCadastro(motivo)) {
        const p = await tx.produto.findUnique({
          where: { id: item.produtoId },
          select: { revisaoCadastro: true, aplicacaoVerificadaEm: true, aplicacaoVerificadaPorNome: true },
        });
        await tx.produto.update({
          where: { id: item.produtoId },
          data: {
            revisaoCadastro: true,
            revisaoCadastroEm: new Date(),
            revisaoCadastroMotivo: `Devolução da venda #${venda.numero}: peça errada por cadastro${body.observacao ? ` — ${body.observacao}` : ""}`.slice(0, 300),
            // O selo deixa de valer: o próprio retorno mostrou que o cadastro errou.
            aplicacaoVerificadaEm: null,
            aplicacaoVerificadaPorId: null,
            aplicacaoVerificadaPorNome: null,
          },
        });
        await registrarAuditoria(tx, {
          usuarioId: usuario.id,
          acao: "CADASTRO_MARCADO_REVISAO",
          entidade: "Produto",
          entidadeId: item.produtoId,
          antes: p,
          depois: { revisaoCadastro: true, aplicacaoVerificadaEm: null, retornoId: r.id },
        });
      }
    }

    if (totalmente) {
      await tx.venda.update({ where: { id: venda.id }, data: { status: "DEVOLVIDA" } });
    }
    await registrarAuditoria(tx, {
      usuarioId: usuario.id,
      acao: "VENDA_DEVOLUCAO",
      entidade: "Venda",
      entidadeId: venda.id,
      antes: { status: venda.status },
      depois: {
        status: totalmente ? "DEVOLVIDA" : venda.status,
        motivo,
        voltaEstoque,
        itens: itens.map((i) => ({ itemVendaId: i.item.id, quantidade: i.quantidade })),
      },
    });
    return criados;
  });

  return NextResponse.json(
    {
      retornos: resultado,
      motivo,
      voltaEstoque,
      vendaDevolvida: totalmente,
      produtoMarcadoRevisao: marcaRevisaoCadastro(motivo),
      aviso:
        "Retorno registrado. Emita a nota de devolução pelo fiscal e faça o estorno ou crédito pelo financeiro.",
    },
    { status: 201 },
  );
});
