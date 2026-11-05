import type { PrismaClient } from "@prisma/client";
import { prisma } from "../db";

// Lista de tarefas do começo de uso. Não bloqueia nada: só mostra o que falta.

export const LINK_CONFIG_FISCAL = "/configuracoes/fiscal";
export const LINK_IMPLANTACAO = "/configuracoes/implantacao";
export const LINK_EQUIPE = "/configuracoes/usuarios";

export type TarefaOnboarding = {
  id: "dados" | "regime" | "fiscal" | "dados-iniciais" | "equipe";
  titulo: string;
  descricao: string;
  feita: boolean;
  link: string | null; // null = a tarefa se resolve no formulário da própria página
};

type EmpresaParaTarefas = {
  inscEstadual: string | null;
  logradouro: string | null;
  cep: string | null;
  municipio: string | null;
  uf: string | null;
  configuracoes: unknown;
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const cheio = (v: string | null) => !!v && v.trim() !== "";

/** Puro: decide o que está feito a partir dos dados já lidos. */
export function montarTarefas(e: EmpresaParaTarefas, totais: { produtos: number; usuarios: number }): TarefaOnboarding[] {
  const cfg = obj(e.configuracoes);
  return [
    {
      id: "dados",
      titulo: "Conferir os dados e o endereço da empresa",
      descricao: "Inscrição estadual, CEP, endereço, cidade e UF. A nota fiscal sai com esses dados.",
      feita: cheio(e.inscEstadual) && cheio(e.logradouro) && cheio(e.cep) && cheio(e.municipio) && cheio(e.uf),
      link: null,
    },
    {
      id: "regime",
      titulo: "Confirmar o regime tributário",
      descricao: "Simples Nacional, Lucro Presumido ou Lucro Real. Define como o imposto é calculado.",
      feita: !!obj(cfg.onboarding).regimeConfirmadoEm,
      link: null,
    },
    {
      id: "fiscal",
      titulo: "Configurar a emissão de notas",
      descricao: "Certificado, série e ambiente. Comece em homologação (teste).",
      feita: Object.keys(obj(cfg.fiscal)).length > 0,
      link: LINK_CONFIG_FISCAL,
    },
    {
      id: "dados-iniciais",
      titulo: "Trazer produtos e clientes",
      descricao: "Importe planilhas do sistema antigo ou cadastre o primeiro produto.",
      feita: totais.produtos > 0,
      link: LINK_IMPLANTACAO,
    },
    {
      id: "equipe",
      titulo: "Convidar a equipe",
      descricao: "Balconistas, caixa e estoque entram com o próprio acesso.",
      feita: totais.usuarios > 1,
      link: LINK_EQUIPE,
    },
  ];
}

export async function tarefasDaEmpresa(empresaId: string, db: PrismaClient = prisma) {
  const [empresa, produtos, usuarios] = await Promise.all([
    db.empresa.findUniqueOrThrow({
      where: { id: empresaId },
      select: { inscEstadual: true, logradouro: true, cep: true, municipio: true, uf: true, configuracoes: true },
    }),
    db.produto.count({ where: { empresaId } }),
    db.usuario.count({ where: { empresaId, ativo: true } }),
  ]);
  return montarTarefas(empresa, { produtos, usuarios });
}
