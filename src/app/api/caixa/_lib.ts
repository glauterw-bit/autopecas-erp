import { prisma } from "@/lib/db";
import { ApiError, UsuarioSessao } from "@/lib/auth/guard";

// Helpers compartilhados da gestão de caixa (PDV)
// ================================================
// Tenant sempre via usuario.empresaId — o pertencimento da sessão é validado
// pela cadeia Caixa → Filial → empresaId.

export const arred2 = (n: number) => Math.round(n * 100) / 100;

export type SessaoAberta = NonNullable<Awaited<ReturnType<typeof sessaoAbertaDoUsuario>>>;

/** Sessão de caixa aberta do usuário (escopada pela empresa). */
export async function sessaoAbertaDoUsuario(usuario: UsuarioSessao) {
  return prisma.sessaoCaixa.findFirst({
    where: {
      usuarioId: usuario.id,
      fechadaEm: null,
      caixa: { filial: { empresaId: usuario.empresaId } },
    },
    orderBy: { abertaEm: "asc" },
    include: {
      caixa: { select: { id: true, nome: true, filial: { select: { nome: true } } } },
      movimentos: {
        where: { tipo: { in: ["SANGRIA", "SUPRIMENTO"] } },
        orderBy: { data: "desc" },
        select: { id: true, tipo: true, valor: true, descricao: true, data: true },
      },
    },
  });
}

export function exigirSessaoAberta(sessao: SessaoAberta | null): SessaoAberta {
  if (!sessao) throw new ApiError(400, "Nenhuma sessão de caixa aberta para este usuário");
  return sessao;
}

/** Totais de sangria e suprimento (em dinheiro) da sessão. */
export function totaisMovimentos(sessao: SessaoAberta) {
  let sangrias = 0;
  let suprimentos = 0;
  for (const m of sessao.movimentos) {
    if (m.tipo === "SANGRIA") sangrias += Number(m.valor);
    if (m.tipo === "SUPRIMENTO") suprimentos += Number(m.valor);
  }
  return { totalSangrias: arred2(sangrias), totalSuprimentos: arred2(suprimentos) };
}

/**
 * Pagamentos considerados na sessão (filtro no PAGAMENTO, não na venda):
 * - pagamentos de vendas vinculadas à sessão (independe de quando a venda foi
 *   criada — cobre condicional/venda antiga faturada dentro da sessão); OU
 * - pagamentos criados desde a abertura em vendas PAGAs do próprio usuário
 *   ainda sem vínculo de sessão.
 */
function filtroPagamentosDaSessao(sessao: SessaoAberta, usuario: UsuarioSessao) {
  return {
    OR: [
      {
        venda: {
          empresaId: usuario.empresaId,
          status: "PAGA" as const,
          sessaoCaixaId: sessao.id,
        },
      },
      {
        criadoEm: { gte: sessao.abertaEm },
        venda: {
          empresaId: usuario.empresaId,
          vendedorId: usuario.id,
          status: "PAGA" as const,
          sessaoCaixaId: null,
        },
      },
    ],
  };
}

/** Total esperado em DINHEIRO: abertura + suprimentos − sangrias + vendas em dinheiro. */
export async function esperadoDinheiro(sessao: SessaoAberta, usuario: UsuarioSessao) {
  const { totalSangrias, totalSuprimentos } = totaisMovimentos(sessao);
  const dinheiro = await prisma.pagamentoVenda.aggregate({
    _sum: { valor: true },
    where: { formaPagamento: "DINHEIRO", ...filtroPagamentosDaSessao(sessao, usuario) },
  });
  const vendasDinheiro = Number(dinheiro._sum.valor ?? 0);
  return arred2(Number(sessao.valorAbertura) + totalSuprimentos - totalSangrias + vendasDinheiro);
}

/** Totais recebidos na sessão, agrupados por forma de pagamento. */
export async function totaisPorFormaPagamento(sessao: SessaoAberta, usuario: UsuarioSessao) {
  const grupos = await prisma.pagamentoVenda.groupBy({
    by: ["formaPagamento"],
    _sum: { valor: true },
    where: filtroPagamentosDaSessao(sessao, usuario),
  });
  return grupos
    .map((g) => ({ formaPagamento: g.formaPagamento, valor: arred2(Number(g._sum.valor ?? 0)) }))
    .sort((a, b) => b.valor - a.valor);
}

/** Serializa a sessão pro cliente (Decimal/Date → primitivos). */
export function serializarSessao(sessao: SessaoAberta) {
  const { totalSangrias, totalSuprimentos } = totaisMovimentos(sessao);
  return {
    id: sessao.id,
    abertaEm: sessao.abertaEm.toISOString(),
    valorAbertura: Number(sessao.valorAbertura),
    caixa: { id: sessao.caixa.id, nome: sessao.caixa.nome, filial: sessao.caixa.filial.nome },
    movimentos: sessao.movimentos.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      valor: Number(m.valor),
      descricao: m.descricao,
      data: m.data.toISOString(),
    })),
    totalSangrias,
    totalSuprimentos,
  };
}
