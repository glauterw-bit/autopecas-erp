import type { Prisma, PrismaClient } from "@prisma/client";
import { registrarAuditoria as gravar } from "../crm/auditoria";

type Db = PrismaClient | Prisma.TransactionClient;

// LogAuditoria sem documento completo (LGPD): chaves de documento e sequências
// de 11 ou 14 dígitos (CPF/CNPJ, com ou sem pontuação) viram "***".
const CHAVE_DOC = /^(cpf|cnpj|cpfcnpj|documento|doc)$/i;
const SEQ_DOC = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;

export function mascararParaLog(valor: unknown, profundidade = 0): unknown {
  if (valor === null || valor === undefined) return valor;
  if (profundidade > 6) return "[…]";
  if (typeof valor === "string") return valor.replace(SEQ_DOC, "***");
  if (Array.isArray(valor)) return valor.map((v) => mascararParaLog(v, profundidade + 1));
  if (typeof valor === "object") {
    // Decimal, Date e afins: deixa o JSON.stringify do gravador resolver.
    const proto = Object.getPrototypeOf(valor);
    if (proto !== Object.prototype && proto !== null) return valor;
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).map(([k, v]) => [
        k,
        CHAVE_DOC.test(k) && v ? "***" : mascararParaLog(v, profundidade + 1),
      ]),
    );
  }
  return valor;
}

/**
 * Grava LogAuditoria com antes e depois, dentro da mesma transação (`tx`) da
 * mudança. `empresaId` é o tenant de quem agiu; a tabela não tem coluna de
 * empresa (o vínculo é pelo usuário), então ele não é gravado.
 */
export async function registrarAuditoria(
  db: Db,
  dados: {
    empresaId: string;
    usuarioId: string;
    acao: string;
    entidade: string;
    entidadeId: string;
    antes?: unknown;
    depois?: unknown;
  },
) {
  await gravar(db, {
    usuarioId: dados.usuarioId,
    acao: dados.acao,
    entidade: dados.entidade,
    entidadeId: dados.entidadeId,
    antes: mascararParaLog(dados.antes),
    depois: mascararParaLog(dados.depois),
  });
}
