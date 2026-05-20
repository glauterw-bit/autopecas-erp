import type { Prisma } from "@prisma/client";
import { prisma } from "../db";

// Apuração de comissões mensal por vendedor.
// Suporta:
//   - PERCENTUAL_VENDA   — % sobre valor total vendido
//   - PERCENTUAL_MARGEM  — % sobre margem bruta (mais justo, alinha incentivo)
//   - ESCALONADA          — faixas (até X = a%, acima = b%, ...)
//   - FIXA_POR_PEDIDO    — valor fixo por venda fechada
//
// Regras adicionais:
//   - Override por categoria/marca (ex.: peças premium pagam mais)
//   - Abater margem queimada (vendas abaixo do margemMinimo não comissionam)
//   - Bonificação se atinge meta mensal

interface ResultadoApuracao {
  totalVendido: number;
  totalMargem: number;
  valorComissao: number;
  bonificacao: number;
  meta?: number;
  atingimento?: number;
  detalhe: {
    porCategoria: Record<string, { vendido: number; comissao: number }>;
    itensExcluidosMargem: number;
  };
}

interface OverridesJson {
  [id: string]: number;
}

export async function apurarComissaoVendedor(opts: {
  empresaId: string;
  vendedorId: string;
  competencia: Date;
  regraId?: string;
}): Promise<ResultadoApuracao | null> {
  const inicio = new Date(opts.competencia.getFullYear(), opts.competencia.getMonth(), 1);
  const fim = new Date(opts.competencia.getFullYear(), opts.competencia.getMonth() + 1, 0, 23, 59, 59);

  const regra = await prisma.regraComissao.findFirst({
    where: opts.regraId
      ? { id: opts.regraId }
      : { empresaId: opts.empresaId, ativa: true },
  });
  if (!regra) return null;

  const itens = await prisma.itemVenda.findMany({
    where: {
      venda: {
        empresaId: opts.empresaId,
        vendedorId: opts.vendedorId,
        criadaEm: { gte: inicio, lte: fim },
        status: { in: ["PAGA", "FATURADA"] },
      },
    },
    include: { produto: { include: { categoria: true, marca: true } } },
  });

  const overrideCat = (regra.overridesCategoria ?? {}) as OverridesJson;
  const overrideMarca = (regra.overridesMarca ?? {}) as OverridesJson;
  const percentualBase = Number(regra.percentualBase ?? 0.03);

  let totalVendido = 0;
  let totalMargem = 0;
  let valorComissao = 0;
  let itensExcluidosMargem = 0;
  const porCategoria: Record<string, { vendido: number; comissao: number }> = {};

  for (const it of itens) {
    const valor = Number(it.total);
    const margem = Number(it.margem ?? 0);
    totalVendido += valor;
    totalMargem += margem;

    if (regra.abaterMargemBaixa && it.margemAbaixoMinimo) {
      itensExcluidosMargem++;
      continue;
    }

    // % aplicada (override por marca > categoria > base)
    let pct = percentualBase;
    if (it.produto.marcaId && overrideMarca[it.produto.marcaId])
      pct = overrideMarca[it.produto.marcaId];
    else if (it.produto.categoriaId && overrideCat[it.produto.categoriaId])
      pct = overrideCat[it.produto.categoriaId];

    let comissaoItem = 0;
    switch (regra.tipoCalculo) {
      case "PERCENTUAL_VENDA":
        comissaoItem = valor * pct;
        break;
      case "PERCENTUAL_MARGEM":
        comissaoItem = Math.max(0, margem * pct);
        break;
      case "ESCALONADA":
        comissaoItem = valor * (totalVendido > 50_000 ? pct * 1.5 : pct);
        break;
      case "FIXA_POR_PEDIDO":
        // contado uma vez por venda — abaixo agregamos
        break;
    }
    valorComissao += comissaoItem;

    const catNome = it.produto.categoria?.nome ?? "Outros";
    porCategoria[catNome] = porCategoria[catNome] ?? { vendido: 0, comissao: 0 };
    porCategoria[catNome].vendido += valor;
    porCategoria[catNome].comissao += comissaoItem;
  }

  // FIXA_POR_PEDIDO: comissão por venda única
  if (regra.tipoCalculo === "FIXA_POR_PEDIDO") {
    const totalVendas = await prisma.venda.count({
      where: {
        empresaId: opts.empresaId,
        vendedorId: opts.vendedorId,
        criadaEm: { gte: inicio, lte: fim },
        status: { in: ["PAGA", "FATURADA"] },
      },
    });
    valorComissao = totalVendas * Number(regra.percentualBase ?? 0);
  }

  let bonificacao = 0;
  let atingimento: number | undefined;
  if (regra.metaMensal) {
    atingimento = totalVendido / Number(regra.metaMensal);
    if (atingimento >= 1 && regra.bonificacaoMeta) {
      bonificacao = Number(regra.bonificacaoMeta);
    }
  }

  return {
    totalVendido,
    totalMargem,
    valorComissao,
    bonificacao,
    meta: regra.metaMensal ? Number(regra.metaMensal) : undefined,
    atingimento,
    detalhe: { porCategoria, itensExcluidosMargem },
  };
}

export async function fecharApuracaoMensal(opts: {
  empresaId: string;
  competencia: Date;
}) {
  const vendedores = await prisma.usuario.findMany({
    where: { empresaId: opts.empresaId, ativo: true, perfil: { in: ["VENDEDOR", "GERENTE"] } },
    select: { id: true, nome: true },
  });
  const regra = await prisma.regraComissao.findFirst({
    where: { empresaId: opts.empresaId, ativa: true },
  });
  if (!regra) return [];

  const comp = `${opts.competencia.getFullYear()}-${String(opts.competencia.getMonth() + 1).padStart(2, "0")}`;
  const resultados = [];
  for (const v of vendedores) {
    const apur = await apurarComissaoVendedor({
      empresaId: opts.empresaId,
      vendedorId: v.id,
      competencia: opts.competencia,
      regraId: regra.id,
    });
    if (!apur) continue;
    const persisted = await prisma.apuracaoComissao.upsert({
      where: {
        empresaId_vendedorId_competencia: {
          empresaId: opts.empresaId,
          vendedorId: v.id,
          competencia: comp,
        },
      },
      update: {
        totalVendido: apur.totalVendido,
        totalMargem: apur.totalMargem,
        valorComissao: apur.valorComissao,
        bonificacao: apur.bonificacao,
        meta: apur.meta,
        atingimento: apur.atingimento,
        detalhe: apur.detalhe as unknown as Prisma.InputJsonValue,
      },
      create: {
        empresaId: opts.empresaId,
        vendedorId: v.id,
        regraId: regra.id,
        competencia: comp,
        totalVendido: apur.totalVendido,
        totalMargem: apur.totalMargem,
        valorComissao: apur.valorComissao,
        bonificacao: apur.bonificacao,
        meta: apur.meta,
        atingimento: apur.atingimento,
        detalhe: apur.detalhe as unknown as Prisma.InputJsonValue,
      },
    });
    resultados.push({ vendedor: v.nome, ...apur, id: persisted.id });
  }
  return resultados;
}
