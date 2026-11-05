import type { Prisma, PrismaClient } from "@prisma/client";

type Cliente = PrismaClient | Prisma.TransactionClient;

// LogAuditoria com antes e depois (CLAUDE.md: preço, estoque, desconto,
// cancelamento, estorno e — aqui — cadastro, crédito e retorno).
// Nunca grave CPF/CNPJ completo no log.
export async function registrarAuditoria(
  db: Cliente,
  dados: {
    usuarioId: string;
    acao: string;
    entidade: string;
    entidadeId: string;
    antes?: unknown;
    depois?: unknown;
  },
) {
  await db.logAuditoria.create({
    data: {
      usuarioId: dados.usuarioId,
      acao: dados.acao,
      entidade: dados.entidade,
      entidadeId: dados.entidadeId,
      dadosAntes: dados.antes === undefined ? undefined : (JSON.parse(JSON.stringify(dados.antes)) as Prisma.InputJsonValue),
      dadosDepois: dados.depois === undefined ? undefined : (JSON.parse(JSON.stringify(dados.depois)) as Prisma.InputJsonValue),
    },
  });
}
