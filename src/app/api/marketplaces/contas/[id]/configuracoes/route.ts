import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError, comAuth } from "@/lib/auth/guard";
import { CHAVE_IMPORTAR_DESDE, importarDesdeDaConta, mesclarConfiguracoes } from "@/lib/marketplaces/config-conta";

const corpo = z.object({ importarPedidosDesde: z.string().datetime({ offset: true }) });

// Opção "importar pedidos a partir de <data>" da conta. Pedido anterior a ela
// fica registrado, mas não vira venda nem baixa estoque.
export const PATCH = comAuth<{ params: Promise<{ id: string }> }>("GERENTE", async (req, ctx, usuario) => {
  const { id } = await ctx.params;
  const { importarPedidosDesde } = corpo.parse(await req.json());
  const conta = await prisma.marketplaceConta.findFirst({
    where: { id, empresaId: usuario.empresaId },
    select: { id: true, configuracoes: true, criadoEm: true },
  });
  if (!conta) throw new ApiError(404, "Conta de marketplace não encontrada");
  const antes = importarDesdeDaConta(conta).toISOString();
  const cfg = mesclarConfiguracoes(conta.configuracoes, { [CHAVE_IMPORTAR_DESDE]: new Date(importarPedidosDesde).toISOString() });
  await prisma.$transaction([
    prisma.marketplaceConta.update({ where: { id: conta.id }, data: { configuracoes: cfg as Prisma.InputJsonValue } }),
    prisma.logAuditoria.create({
      data: {
        usuarioId: usuario.id,
        acao: "MARKETPLACE_IMPORTAR_DESDE",
        entidade: "MarketplaceConta",
        entidadeId: conta.id,
        dadosAntes: { importarPedidosDesde: antes },
        dadosDepois: { importarPedidosDesde: cfg[CHAVE_IMPORTAR_DESDE] as string },
      },
    }),
  ]);
  return NextResponse.json({ importarPedidosDesde: cfg[CHAVE_IMPORTAR_DESDE] });
});
