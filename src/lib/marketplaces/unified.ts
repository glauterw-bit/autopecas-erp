import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { MercadoLivreAdapter } from "./mercado-livre";
import { ShopeeAdapter } from "./shopee";
import type { AdaptadorMarketplace } from "./types";

// Hub unificado: o sistema chama "sincronizar tudo" e cada adaptador faz a parte.
//
// A sincronia é idempotente — sempre escreve em tabelas internas
// (MarketplaceAnuncio / MarketplacePedido / MensagemMarketplace) e qualquer
// reprocessamento converge para o mesmo estado.

export function adaptadorDe(plataforma: string, contaId: string): AdaptadorMarketplace {
  switch (plataforma) {
    case "MERCADO_LIVRE":
      return new MercadoLivreAdapter(contaId);
    case "SHOPEE":
      return new ShopeeAdapter(contaId);
    default:
      throw new Error(`Plataforma ${plataforma} não suportada`);
  }
}

export async function sincronizarConta(contaId: string) {
  const conta = await prisma.marketplaceConta.findUniqueOrThrow({
    where: { id: contaId },
  });
  if (!conta.ativa) return;
  const adapter = adaptadorDe(conta.plataforma, contaId);

  const [anuncios, pedidos, mensagens] = await Promise.all([
    adapter.listarAnuncios(),
    adapter.listarPedidosRecentes(),
    adapter.listarMensagensNaoLidas(),
  ]);

  // Persiste anúncios — match por SKU/título quando possível.
  for (const a of anuncios) {
    try {
      const produtoId = await encontrarProdutoPorTitulo(conta.empresaId, a.titulo);
      await prisma.marketplaceAnuncio.upsert({
        where: { contaId_itemIdExterno: { contaId, itemIdExterno: a.itemIdExterno } },
        update: {
          titulo: a.titulo,
          preco: a.preco,
          estoqueExposto: a.estoque,
          status: a.status,
          url: a.url,
          tipoListagem: a.tipoListagem,
          ultimaSincronizacao: new Date(),
        },
        create: {
          contaId,
          produtoId,
          itemIdExterno: a.itemIdExterno,
          titulo: a.titulo,
          preco: a.preco,
          estoqueExposto: a.estoque,
          status: a.status,
          url: a.url,
          tipoListagem: a.tipoListagem,
          ultimaSincronizacao: new Date(),
        },
      });
    } catch {
      // ignora se produto não pôde ser associado (revisão manual)
    }
  }

  // Persiste pedidos novos.
  for (const p of pedidos) {
    await prisma.marketplacePedido.upsert({
      where: { contaId_pedidoIdExterno: { contaId, pedidoIdExterno: p.pedidoIdExterno } },
      update: { status: p.status, payloadOriginal: p.payloadOriginal as Prisma.InputJsonValue },
      create: {
        contaId,
        pedidoIdExterno: p.pedidoIdExterno,
        status: p.status,
        valorTotal: p.valorTotal,
        valorFrete: p.valorFrete,
        feeMarketplace: p.feeMarketplace,
        dataPedido: p.dataPedido,
        payloadOriginal: p.payloadOriginal as Prisma.InputJsonValue,
      },
    });
  }

  // Persiste mensagens (OmniInbox) — dedup por (contaId, conversaIdExterno).
  for (const m of mensagens) {
    const existente = await prisma.mensagemMarketplace.findFirst({
      where: { contaId, conversaIdExterno: m.conversaIdExterno },
      select: { id: true },
    });
    if (!existente) {
      await prisma.mensagemMarketplace.create({
        data: {
          contaId,
          conversaIdExterno: m.conversaIdExterno,
          remetente: m.remetente,
          texto: m.texto,
          recebidaEm: m.recebidaEm,
        },
      });
    }
  }

  await prisma.marketplaceConta.update({
    where: { id: contaId },
    data: { ultimoSync: new Date() },
  });

  return { anuncios: anuncios.length, pedidos: pedidos.length, mensagens: mensagens.length };
}

// Heurística simples (em produção troca por embeddings + score).
async function encontrarProdutoPorTitulo(empresaId: string, titulo: string): Promise<string> {
  const p = await prisma.produto.findFirst({
    where: {
      empresaId,
      nome: { contains: titulo.split(" ")[0] ?? "", mode: "insensitive" },
    },
    select: { id: true },
  });
  if (p) return p.id;
  // produto-placeholder para evitar quebra; em produção sinaliza para revisão manual
  throw new Error("Produto não associado");
}
