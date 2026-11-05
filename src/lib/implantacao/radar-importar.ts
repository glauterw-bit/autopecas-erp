// Importação completa a partir do espelho do Radar, na ordem certa:
// fornecedores → produtos (com preços) → estoque → clientes.
// Contas a receber não estão no espelho (procedimento 3 não é sincronizado):
// entram por CSV.
import type { PrismaClient } from "@prisma/client";
import { importar } from "./importar";
import { lerRadar, type OpcoesRadar } from "./radar";
import type { ResultadoImportacao } from "./conferencia";

export type EntidadeRadar = "fornecedores" | "produtos" | "estoque" | "clientes";
export const ENTIDADES_RADAR: EntidadeRadar[] = ["fornecedores", "produtos", "estoque", "clientes"];

export async function importarDoRadar(
  db: PrismaClient,
  o: {
    empresaId: string;
    usuarioId?: string | null;
    simular: boolean;
    radar: OpcoesRadar;
    entidades?: EntidadeRadar[];
  },
): Promise<{ resultados: ResultadoImportacao[]; consultasOrigem: number; tabelas: Record<string, boolean> }> {
  const quer = new Set(o.entidades ?? ENTIDADES_RADAR);
  const dados = await lerRadar(o.radar);
  const base = { empresaId: o.empresaId, usuarioId: o.usuarioId, simular: o.simular, origem: "RADAR" as const };
  const resultados: ResultadoImportacao[] = [];

  if (quer.has("fornecedores") && dados.fornecedores.length)
    resultados.push(await importar(db, { ...base, entidade: "FORNECEDOR", registros: dados.fornecedores }));
  if (quer.has("produtos"))
    resultados.push(
      await importar(db, {
        ...base,
        entidade: "PRODUTO",
        registros: dados.produtos,
        detalhesExtras: {
          precoTabelaDoHistorico: dados.info.precoTabelaDoHistorico,
          precoTabelaIgualMinimo: dados.info.precoTabelaIgualMinimo,
        },
      }),
    );
  if (quer.has("estoque") && dados.estoque.length)
    resultados.push(
      await importar(db, {
        ...base,
        entidade: "ESTOQUE",
        registros: dados.estoque,
        // na simulação os produtos ainda não existem: considera os que a etapa anterior criaria
        skusPrevistos: o.simular ? new Set(dados.produtos.map((p) => p.valores.codigo ?? "")) : undefined,
      }),
    );
  if (quer.has("clientes") && dados.clientes.length)
    resultados.push(await importar(db, { ...base, entidade: "CLIENTE", registros: dados.clientes }));

  return { resultados, consultasOrigem: dados.info.consultas, tabelas: dados.info.tabelas };
}
