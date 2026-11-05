import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/auth/guard";

// Apoio das rotas de aplicação veicular (route.ts não pode exportar helpers).

export const resumoAplicacao = {
  id: true,
  posicao: true,
  quantidadePorVeiculo: true,
  observacao: true,
  versao: {
    select: {
      id: true,
      descricao: true,
      motor: true,
      anoInicio: true,
      anoFim: true,
      modelo: { select: { nome: true, montadora: { select: { nome: true } } } },
    },
  },
} as const;

export async function exigirProduto(id: string, empresaId: string) {
  const p = await prisma.produto.findFirst({
    where: { id, empresaId },
    select: { id: true, aplicacaoVerificadaEm: true, aplicacaoVerificadaPorNome: true },
  });
  if (!p) throw new ApiError(404, "Produto não encontrado");
  return p;
}

