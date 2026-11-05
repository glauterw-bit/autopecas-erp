import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { ApiError } from "../auth/guard";
import { registrarAuditoria } from "../auth/auditoria";
import * as asaas from "./asaas";
import { AsaasError } from "./asaas";

// Escolher/trocar plano e cancelar. Cobrança só nasce com preço definido (> 0).

type Db = PrismaClient;
type Ator = { id: string; empresaId: string };

export type EscolhaPlano = {
  planoCodigo: string;
  ciclo: "MENSAL" | "ANUAL";
  forma: asaas.FormaCobranca;
};

function hojeBR(agora: Date): string {
  return new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function traduzir(e: unknown): never {
  if (e instanceof AsaasError) throw new ApiError(e.status === 422 ? 422 : e.status, e.message);
  throw e;
}

export async function escolherPlano(ator: Ator, escolha: EscolhaPlano, db: Db = prisma, agora = new Date()) {
  const ass = await db.assinatura.findUnique({ where: { empresaId: ator.empresaId }, include: { plano: true } });
  if (!ass) throw new ApiError(404, "Assinatura não encontrada.");
  if (ass.status === "SUSPENSA" && ass.suspensaMotivo) {
    throw new ApiError(403, "Conta suspensa. Fale com o suporte para reativar.");
  }
  const plano = await db.plano.findUnique({ where: { codigo: escolha.planoCodigo } });
  if (!plano || !plano.ativo || !plano.publico) throw new ApiError(404, "Plano não encontrado.");

  const preco = Number(escolha.ciclo === "ANUAL" ? plano.precoAnual : plano.precoMensal);
  if (!(preco > 0)) {
    throw new ApiError(422, "O preço deste plano ainda não foi definido. Fale com o suporte para contratar.");
  }

  // Não deixa descer para um plano menor do que a loja já usa.
  const [usuarios, produtos] = await Promise.all([
    db.usuario.count({ where: { empresaId: ator.empresaId, ativo: true } }),
    db.produto.count({ where: { empresaId: ator.empresaId, ativo: true } }),
  ]);
  if (plano.limiteUsuarios !== null && usuarios > plano.limiteUsuarios) {
    throw new ApiError(422, `Este plano permite ${plano.limiteUsuarios} usuários e a loja tem ${usuarios}. Desative usuários antes de trocar.`);
  }
  if (plano.limiteProdutos !== null && produtos > plano.limiteProdutos) {
    throw new ApiError(422, `Este plano permite ${plano.limiteProdutos} produtos e a loja tem ${produtos}.`);
  }

  const empresa = await db.empresa.findUniqueOrThrow({
    where: { id: ator.empresaId },
    select: { razaoSocial: true, cnpj: true, email: true, telefone: true },
  });
  const cicloAsaas: asaas.CicloAsaas = escolha.ciclo === "ANUAL" ? "YEARLY" : "MONTHLY";
  const emTrial = ass.status === "TRIAL" && !!ass.trialFimEm && ass.trialFimEm > agora;
  const primeiroVencimento = emTrial ? ass.trialFimEm!.toISOString().slice(0, 10) : hojeBR(agora);

  let clienteId = ass.asaasClienteId;
  let assinaturaId = ass.asaasAssinaturaId;
  try {
    if (!clienteId) {
      clienteId = (
        await asaas.criarCliente({
          nome: empresa.razaoSocial,
          cnpj: empresa.cnpj,
          email: empresa.email ?? "",
          celular: empresa.telefone,
          empresaId: ator.empresaId,
        })
      ).id;
    }
    if (assinaturaId && ass.status !== "CANCELADA") {
      await asaas.atualizarAssinatura(assinaturaId, { valor: preco, ciclo: cicloAsaas, forma: escolha.forma });
    } else {
      assinaturaId = (
        await asaas.criarAssinatura({
          clienteId,
          valor: preco,
          ciclo: cicloAsaas,
          forma: escolha.forma,
          primeiroVencimento,
          descricao: `AutoPeças ERP - plano ${plano.nome}`,
          empresaId: ator.empresaId,
        })
      ).id;
    }
  } catch (e) {
    traduzir(e);
  }

  // Quem tinha cancelado volta "aguardando o primeiro pagamento" (carência normal).
  const voltandoDeCancelada = ass.status === "CANCELADA";
  const assinaturaNova = !ass.asaasAssinaturaId || ass.status === "CANCELADA" || assinaturaId !== ass.asaasAssinaturaId;
  const depois = await db.$transaction(async (tx) => {
    const atual = await tx.assinatura.update({
      where: { id: ass.id },
      data: {
        planoId: plano.id,
        ciclo: escolha.ciclo,
        formaPagamento: escolha.forma,
        asaasClienteId: clienteId,
        asaasAssinaturaId: assinaturaId,
        // O vencimento só muda quando a assinatura é nova; quem já está ATIVA e só troca de plano mantém a data.
        ...(assinaturaNova ? { proximoVencimento: new Date(`${primeiroVencimento}T12:00:00Z`) } : {}),
        // Quem volta de CANCELADA sem pagar fica INADIMPLENTE, mas a dívida antiga NÃO zera:
        // se já havia atraso, a data original é mantida (sem ganhar mais 20 dias de uso grátis).
        // Só quem nunca teve atraso ganha a carência normal, a partir de agora.
        ...(voltandoDeCancelada ? { status: "INADIMPLENTE", inadimplenteDesde: ass.inadimplenteDesde ?? agora, canceladaEm: null } : {}),
      },
    });
    await registrarAuditoria(tx, {
      empresaId: ator.empresaId,
      usuarioId: ator.id,
      acao: "ASSINATURA_PLANO_ESCOLHIDO",
      entidade: "Assinatura",
      entidadeId: ass.id,
      antes: { plano: ass.plano.codigo, ciclo: ass.ciclo, status: ass.status },
      depois: { plano: plano.codigo, ciclo: escolha.ciclo, forma: escolha.forma, status: atual.status },
    });
    return atual;
  });

  // Link da primeira fatura (boleto/Pix/cartão no Asaas), se já existir.
  let linkPagamento: string | null = null;
  try {
    const cobrancas = await asaas.listarCobrancas(assinaturaId!);
    linkPagamento = cobrancas.find((c) => c.status === "PENDING")?.invoiceUrl ?? cobrancas[0]?.invoiceUrl ?? null;
  } catch {
    /* o link também aparece na tela de assinatura depois */
  }
  return { status: depois.status, linkPagamento };
}

export async function cancelarAssinatura(ator: Ator, db: Db = prisma, agora = new Date()) {
  const ass = await db.assinatura.findUnique({ where: { empresaId: ator.empresaId }, include: { plano: true } });
  if (!ass) throw new ApiError(404, "Assinatura não encontrada.");
  if (ass.status === "CANCELADA") return { status: ass.status };
  if (ass.status === "SUSPENSA") throw new ApiError(403, "Conta suspensa. Fale com o suporte.");
  if (ass.plano.codigo === "INTERNO") {
    throw new ApiError(422, "Esta conta é implantada à mão pelo suporte. Fale com o suporte para encerrar.");
  }
  if (ass.asaasAssinaturaId) {
    try {
      await asaas.cancelarAssinaturaAsaas(ass.asaasAssinaturaId);
    } catch (e) {
      traduzir(e);
    }
  }
  await db.$transaction(async (tx) => {
    await tx.assinatura.update({ where: { id: ass.id }, data: { status: "CANCELADA", canceladaEm: agora } });
    await registrarAuditoria(tx as Prisma.TransactionClient, {
      empresaId: ator.empresaId,
      usuarioId: ator.id,
      acao: "ASSINATURA_CANCELADA",
      entidade: "Assinatura",
      entidadeId: ass.id,
      antes: { status: ass.status, plano: ass.plano.codigo },
      depois: { status: "CANCELADA" },
    });
  });
  return { status: "CANCELADA" as const };
}
