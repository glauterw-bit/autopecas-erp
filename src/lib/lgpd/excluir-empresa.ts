// Exclusão dos dados de uma empresa depois do cancelamento (uso do dono do SaaS,
// via scripts/excluir-empresa.ts). Apaga os dados operacionais e MANTÉM o que a
// lei manda guardar:
//   - notas_fiscais (com os XMLs) e notas_entrada: documento fiscal, 5 anos
//     (CTN arts. 173 e 174);
//   - lancamentos_contabeis (e suas partidas): escrituração;
//   - a linha da empresa (razão social, CNPJ, IE), sem e-mail, telefone,
//     endereço, chaves e configurações;
//   - fornecedores que têm nota de entrada guardada (para identificar a nota);
//   - aceites_termos e logs_auditoria (prova de conformidade; sem documento completo);
//   - assinaturas e consumo_notas_mes: registro comercial da cobrança (plano, datas, ids do
//     Asaas, notas emitidas por mês). Decisão da revisão R5: ficam, porque servem para
//     conferir cobranças e contestações e não guardam dado pessoal de cliente da loja.
// Tudo roda numa transação. Na simulação a transação é desfeita no fim, então
// as contagens são exatas e os vínculos do banco (FK) também são testados.
import type { PrismaClient } from "@prisma/client";

const E = "$1";

/** [rótulo, SQL com $1 = empresaId]. A ordem respeita as chaves estrangeiras. */
const PASSOS: [string, string][] = [
  ["push_subscriptions", `DELETE FROM push_subscriptions WHERE "usuarioId" IN (SELECT id FROM usuarios WHERE "empresaId" = ${E}) OR "clienteId" IN (SELECT id FROM clientes WHERE "empresaId" = ${E})`],
  ["conversas_ia", `DELETE FROM conversas_ia WHERE "clienteId" IN (SELECT id FROM clientes WHERE "empresaId" = ${E})`],
  ["garantias_item", `DELETE FROM garantias_item WHERE "produtoId" IN (SELECT id FROM produtos WHERE "empresaId" = ${E})`],
  ["solicitacoes_rma", `DELETE FROM solicitacoes_rma WHERE "empresaId" = ${E}`],
  ["ordens_servico", `DELETE FROM ordens_servico WHERE "empresaId" = ${E}`],
  ["retornos_venda", `DELETE FROM retornos_venda WHERE "empresaId" = ${E}`],
  ["vendas_perdidas", `DELETE FROM vendas_perdidas WHERE "empresaId" = ${E}`],
  ["vendas", `DELETE FROM vendas WHERE "empresaId" = ${E}`],
  ["contas_receber", `DELETE FROM contas_receber WHERE "empresaId" = ${E}`],
  ["contas_pagar", `DELETE FROM contas_pagar WHERE "empresaId" = ${E}`],
  ["apuracoes_comissao", `DELETE FROM apuracoes_comissao WHERE "empresaId" = ${E}`],
  ["regras_comissao", `DELETE FROM regras_comissao WHERE "empresaId" = ${E}`],
  ["movimentos_caixa", `DELETE FROM movimentos_caixa WHERE "empresaId" = ${E}`],
  ["sessoes_caixa", `DELETE FROM sessoes_caixa WHERE "usuarioId" IN (SELECT id FROM usuarios WHERE "empresaId" = ${E})`],
  ["caixas", `DELETE FROM caixas WHERE "filialId" IN (SELECT id FROM filiais WHERE "empresaId" = ${E})`],
  ["contas_bancarias", `DELETE FROM contas_bancarias WHERE "empresaId" = ${E}`],
  ["marketplace_contas", `DELETE FROM marketplace_contas WHERE "empresaId" = ${E}`],
  ["eventos_webhook", `DELETE FROM eventos_webhook WHERE "empresaId" = ${E}`],
  ["inventarios", `DELETE FROM inventarios WHERE "empresaId" = ${E}`],
  ["reservas_estoque", `DELETE FROM reservas_estoque WHERE "produtoId" IN (SELECT id FROM produtos WHERE "empresaId" = ${E})`],
  ["movimentos_estoque", `DELETE FROM movimentos_estoque WHERE "produtoId" IN (SELECT id FROM produtos WHERE "empresaId" = ${E})`],
  ["itens_promocao", `DELETE FROM itens_promocao WHERE "produtoId" IN (SELECT id FROM produtos WHERE "empresaId" = ${E})`],
  ["pedidos_compra", `DELETE FROM pedidos_compra WHERE "empresaId" = ${E}`],
  ["produtos", `DELETE FROM produtos WHERE "empresaId" = ${E}`],
  ["depositos", `DELETE FROM depositos WHERE "empresaId" = ${E}`],
  ["filiais", `DELETE FROM filiais WHERE "empresaId" = ${E}`],
  ["clientes", `DELETE FROM clientes WHERE "empresaId" = ${E}`],
  ["tabelas_preco", `DELETE FROM tabelas_preco WHERE "empresaId" = ${E}`],
  ["fornecedores", `DELETE FROM fornecedores WHERE "empresaId" = ${E} AND id NOT IN (SELECT "fornecedorId" FROM notas_entrada)`],
  ["importacao_chaves", `DELETE FROM importacao_chaves WHERE "empresaId" = ${E}`],
  ["importacao_lotes", `DELETE FROM importacao_lotes WHERE "empresaId" = ${E}`],
  ["insights_ia", `DELETE FROM insights_ia WHERE "empresaId" = ${E}`],
  ["uso_ia", `DELETE FROM uso_ia WHERE "empresaId" = ${E}`],
  ["pix_recorrencias", `DELETE FROM pix_recorrencias WHERE "empresaId" = ${E}`],
  ["sessoes_auth", `DELETE FROM sessoes_auth WHERE "usuarioId" IN (SELECT id FROM usuarios WHERE "empresaId" = ${E})`],
  ["usuarios", `DELETE FROM usuarios WHERE "empresaId" = ${E}`],
  [
    "empresa (dados de contato e segredos)",
    `UPDATE empresas SET email = NULL, telefone = NULL, logradouro = NULL, numero = NULL, complemento = NULL, bairro = NULL, cep = NULL, "logoUrl" = NULL, "vallenteApiKey" = NULL, configuracoes = NULL WHERE id = ${E}`,
  ],
];

/** Tabelas com "empresaId" que podem continuar com linhas depois da exclusão. */
export const MANTIDAS = ["notas_fiscais", "lancamentos_contabeis", "aceites_termos", "fornecedores", "assinaturas", "consumo_notas_mes"] as const;

export type ResultadoExclusao = {
  simulacao: boolean;
  apagados: Record<string, number>;
  mantidos: Record<string, number>;
};

class Desfazer extends Error {}

export async function excluirDadosDaEmpresa(
  db: PrismaClient,
  empresaId: string,
  opts: { simular: boolean },
): Promise<ResultadoExclusao> {
  const apagados: Record<string, number> = {};
  const mantidos: Record<string, number> = {};
  const rodar = async (tx: Pick<PrismaClient, "$executeRawUnsafe" | "$queryRawUnsafe">) => {
    const emp = (await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM empresas WHERE id = $1`, empresaId))[0];
    if (!emp?.n) throw new Error("Empresa não encontrada");
    for (const [rotulo, sql] of PASSOS) apagados[rotulo] = await tx.$executeRawUnsafe(sql, empresaId);

    // Rede de segurança: qualquer tabela com "empresaId" que ficou com linhas e não
    // está na lista do que a lei manda guardar faz a operação inteira ser desfeita.
    const tabelas = await tx.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'empresaId' AND table_schema = 'public' AND table_name <> 'empresas'`,
    );
    for (const { table_name } of tabelas) {
      if (!/^[a-z_]+$/.test(table_name)) continue;
      const r = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "${table_name}" WHERE "empresaId" = $1`,
        empresaId,
      );
      const n = r[0]?.n ?? 0;
      if (n > 0) {
        if (!(MANTIDAS as readonly string[]).includes(table_name)) {
          throw new Error(`A tabela ${table_name} ainda tem ${n} linha(s) da empresa e não está na lista do que se mantém. Nada foi apagado.`);
        }
        mantidos[table_name] = n;
      }
    }
    if (opts.simular) throw new Desfazer();
  };
  try {
    await db.$transaction(rodar, { timeout: 10 * 60_000, maxWait: 30_000 });
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }
  return { simulacao: opts.simular, apagados, mantidos };
}
