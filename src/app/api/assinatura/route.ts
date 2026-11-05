import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { comAuth } from "@/lib/auth/guard";
import { acessoDaEmpresa, resumoDeUso } from "@/lib/assinatura/politica";
import { asaasConfigurado, listarCobrancas, type CobrancaAsaas } from "@/lib/assinatura/asaas";

// Situação da assinatura da própria loja (só ADMIN): plano, status, uso, faturas e planos à venda.
export const GET = comAuth("ADMIN", async (_req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const [acesso, uso, planos, ass] = await Promise.all([
    acessoDaEmpresa(empresaId),
    resumoDeUso(empresaId),
    prisma.plano.findMany({ where: { ativo: true, publico: true }, orderBy: { precoMensal: "asc" } }),
    prisma.assinatura.findUnique({ where: { empresaId }, select: { asaasAssinaturaId: true, formaPagamento: true } }),
  ]);
  let faturas: CobrancaAsaas[] = [];
  if (ass?.asaasAssinaturaId && asaasConfigurado()) {
    faturas = await listarCobrancas(ass.asaasAssinaturaId).catch(() => []);
  }
  return NextResponse.json({
    modo: acesso.modo,
    mensagem: acesso.mensagem,
    assinatura: acesso.assinatura,
    formaPagamento: ass?.formaPagamento ?? null,
    uso,
    faturas: faturas.map((f) => ({ id: f.id, status: f.status, valor: f.value, vencimento: f.dueDate, link: f.invoiceUrl ?? f.bankSlipUrl ?? null })),
    planos: planos.map((p) => ({
      codigo: p.codigo, nome: p.nome, descricao: p.descricao, provisorio: p.provisorio,
      precoMensal: p.precoMensal.toString(), precoAnual: p.precoAnual.toString(),
      limiteUsuarios: p.limiteUsuarios, limiteDepositos: p.limiteDepositos,
      limiteNotasMes: p.limiteNotasMes, limiteProdutos: p.limiteProdutos, modulos: p.modulos,
      precoNotaExcedente: p.precoNotaExcedente.toString(), precoUsuarioExtra: p.precoUsuarioExtra.toString(), precoCnpjAdicional: p.precoCnpjAdicional.toString(),
    })),
    cobrancaConfigurada: asaasConfigurado(),
  });
});
