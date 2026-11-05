import type { PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { ApiError } from "../auth/guard";
import {
  calcularAcesso,
  avaliarNotas,
  checarLimiteSimples,
  checarLimiteUsuarios,
  decidirRota,
  moduloDaRotaApi,
  moduloLiberado,
  NOME_MODULO,
  type AcessoCalculado,
  type LimitesPlano,
  type Modulo,
  type StatusAssinatura,
} from "./estado";

// Ponto central de "o plano e o pagamento valem". Quem chama:
//  - comAuth (guard.ts): modo de acesso e módulo, para toda rota de API;
//  - exigirPerfilPagina (auth/pagina.ts): o mesmo, para as telas;
//  - usuários, produtos, depósitos e emissão de nota: os limites de quantidade.
// Empresa sem assinatura (não deveria existir após a migração) NÃO é bloqueada.

type Db = PrismaClient;

export type AssinaturaCompleta = {
  status: StatusAssinatura;
  ciclo: "MENSAL" | "ANUAL";
  trialFimEm: Date | null;
  inadimplenteDesde: Date | null;
  proximoVencimento: Date | null;
  suspensaMotivo: string | null;
  plano: LimitesPlano & { codigo: string };
};

export async function carregarAssinatura(empresaId: string, db: Db = prisma): Promise<AssinaturaCompleta | null> {
  const a = await db.assinatura.findUnique({ where: { empresaId }, include: { plano: true } });
  if (!a) return null;
  return {
    status: a.status,
    ciclo: a.ciclo,
    trialFimEm: a.trialFimEm,
    inadimplenteDesde: a.inadimplenteDesde,
    proximoVencimento: a.proximoVencimento,
    suspensaMotivo: a.suspensaMotivo,
    plano: {
      codigo: a.plano.codigo,
      nome: a.plano.nome,
      limiteUsuarios: a.plano.limiteUsuarios,
      limiteDepositos: a.plano.limiteDepositos,
      limiteNotasMes: a.plano.limiteNotasMes,
      limiteProdutos: a.plano.limiteProdutos,
      modulos: a.plano.modulos,
    },
  };
}

export async function acessoDaEmpresa(empresaId: string, db: Db = prisma): Promise<AcessoCalculado & { assinatura: AssinaturaCompleta | null }> {
  const assinatura = await carregarAssinatura(empresaId, db);
  if (!assinatura) return { modo: "NORMAL", mensagem: null, diasRestantes: null, assinatura: null };
  return { ...calcularAcesso(assinatura), assinatura };
}

function erro402(erro: string, codigo: string) {
  return new ApiError(402, erro, codigo);
}

/** Chamada por comAuth antes do handler. Lança ApiError 402 quando a rota não vale para o estado da loja. */
export async function aplicarPoliticaAssinatura(req: Request, empresaId: string, db: Db = prisma): Promise<void> {
  let acesso: Awaited<ReturnType<typeof acessoDaEmpresa>>;
  const caminho = new URL(req.url).pathname;
  try {
    acesso = await acessoDaEmpresa(empresaId, db);
  } catch (e) {
    // Falha ao consultar a assinatura não pode derrubar a loja inteira.
    console.error("[assinatura] não consegui ler a assinatura; liberando", (e as Error).message);
    return;
  }

  const decisao = decidirRota(acesso.modo, acesso.mensagem, req.method, caminho);
  if (!decisao.liberado) throw erro402(decisao.erro, decisao.codigo);

  const modulo = moduloDaRotaApi(caminho);
  if (modulo && acesso.assinatura && !moduloLiberado(acesso.assinatura.plano, modulo)) {
    throw erro402(mensagemModulo(modulo, acesso.assinatura.plano.nome), "MODULO_FORA_DO_PLANO");
  }
}

export function mensagemModulo(modulo: Modulo, nomePlano: string): string {
  return `O módulo "${NOME_MODULO[modulo]}" não faz parte do seu plano (${nomePlano}). Mude de plano em Configurações > Assinatura para liberar.`;
}

// --- Limites de quantidade -------------------------------------------------------

async function planoOuNull(empresaId: string, db: Db): Promise<LimitesPlano | null> {
  return (await carregarAssinatura(empresaId, db))?.plano ?? null;
}

export async function exigirLimiteUsuarios(empresaId: string, db: Db = prisma): Promise<void> {
  const plano = await planoOuNull(empresaId, db);
  if (!plano) return;
  const usados = await db.usuario.count({ where: { empresaId, ativo: true } });
  const r = checarLimiteUsuarios(plano, usados);
  if (!r.ok) throw erro402(r.erro, "LIMITE_USUARIOS");
}

export async function exigirLimiteProdutos(empresaId: string, db: Db = prisma): Promise<void> {
  const plano = await planoOuNull(empresaId, db);
  if (!plano || plano.limiteProdutos === null) return;
  const n = await db.produto.count({ where: { empresaId, ativo: true } });
  const r = checarLimiteSimples(n, plano.limiteProdutos, "produto", "produtos");
  if (!r.ok) throw erro402(r.erro, "LIMITE_PRODUTOS");
}

export async function exigirLimiteDepositos(empresaId: string, db: Db = prisma): Promise<void> {
  const plano = await planoOuNull(empresaId, db);
  if (!plano || plano.limiteDepositos === null) return;
  const n = await db.deposito.count({ where: { empresaId } });
  const r = checarLimiteSimples(n, plano.limiteDepositos, "depósito", "depósitos");
  if (!r.ok) throw erro402(r.erro, "LIMITE_DEPOSITOS");
}

/** Início do mês corrente no horário de Brasília (UTC−3). */
export function inicioDoMes(agora: Date = new Date()): Date {
  const br = new Date(agora.getTime() - 3 * 3600 * 1000);
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), 1, 3));
}

/** Notas que contam para o plano: de produção e que não foram rejeitadas. */
export async function notasDoMes(empresaId: string, db: Db = prisma, agora: Date = new Date()): Promise<number> {
  return db.notaFiscal.count({
    where: {
      empresaId,
      ambiente: "PRODUCAO",
      status: { in: ["EMITINDO", "AUTORIZADA", "CANCELADA", "DENEGADA"] },
      dataEmissao: { gte: inicioDoMes(agora) },
    },
  });
}

/** Mês (YYYY-MM, horário de Brasília) usado no contador de consumo. */
export function chaveDoMes(agora: Date = new Date()): string {
  return new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 7);
}

/**
 * Chame quando uma nota de PRODUÇÃO for gravada (dentro da transação da nota).
 * Soma 1 no contador do mês e recalcula o excedente (notas acima do limite do
 * plano) numa única instrução, sem corrida. Nunca bloqueia nem falha a emissão.
 */
export async function registrarNotaEmitida(
  db: Pick<Db, "$executeRaw"> & Pick<Db, "assinatura">,
  empresaId: string,
  agora: Date = new Date(),
): Promise<void> {
  try {
    const ass = await db.assinatura.findUnique({ where: { empresaId }, select: { plano: { select: { limiteNotasMes: true } } } });
    const limite = ass?.plano.limiteNotasMes ?? null;
    const mes = chaveDoMes(agora);
    await db.$executeRaw`
      INSERT INTO "consumo_notas_mes" ("id","empresaId","mes","notas","excedentes","atualizadoEm")
      VALUES (${"cn_" + empresaId + "_" + mes}, ${empresaId}, ${mes}, 1,
              CASE WHEN ${limite}::int IS NOT NULL AND 1 > ${limite}::int THEN 1 - ${limite}::int ELSE 0 END, CURRENT_TIMESTAMP)
      ON CONFLICT ("empresaId","mes") DO UPDATE SET
        "notas" = "consumo_notas_mes"."notas" + 1,
        "excedentes" = CASE WHEN ${limite}::int IS NULL THEN 0
                            ELSE GREATEST(0, "consumo_notas_mes"."notas" + 1 - ${limite}::int) END,
        "atualizadoEm" = CURRENT_TIMESTAMP`;
  } catch (e) {
    console.error("[assinatura] não consegui contar a nota do mês", (e as Error).message);
  }
}

/** Para o banner e para a tela de assinatura. */
export async function resumoDeUso(empresaId: string, db: Db = prisma) {
  const plano = await planoOuNull(empresaId, db);
  const [usuarios, produtos, depositos, notas] = await Promise.all([
    db.usuario.count({ where: { empresaId, ativo: true } }),
    db.produto.count({ where: { empresaId, ativo: true } }),
    db.deposito.count({ where: { empresaId } }),
    notasDoMes(empresaId, db),
  ]);
  return {
    usuarios: { usado: usuarios, limite: plano?.limiteUsuarios ?? null },
    produtos: { usado: produtos, limite: plano?.limiteProdutos ?? null },
    depositos: { usado: depositos, limite: plano?.limiteDepositos ?? null },
    notasMes: { usado: notas, limite: plano?.limiteNotasMes ?? null },
    avisoNotas: plano ? avaliarNotas(plano, notas) : null,
    excedenteMes: await excedenteDoMes(empresaId, db),
  };
}

/** Notas acima do plano neste mês e o valor por nota (a confirmar; zero enquanto o preço for provisório). */
export async function excedenteDoMes(empresaId: string, db: Db = prisma) {
  const [linha, ass] = await Promise.all([
    db.consumoNotasMes.findUnique({ where: { empresaId_mes: { empresaId, mes: chaveDoMes() } } }),
    db.assinatura.findUnique({ where: { empresaId }, select: { plano: { select: { precoNotaExcedente: true } } } }),
  ]);
  return { quantidade: linha?.excedentes ?? 0, precoPorNota: ass?.plano.precoNotaExcedente.toString() ?? "0" };
}
