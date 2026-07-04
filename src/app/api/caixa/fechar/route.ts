import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import {
  arred2,
  esperadoDinheiro,
  exigirSessaoAberta,
  sessaoAbertaDoUsuario,
  totaisMovimentos,
  totaisPorFormaPagamento,
} from "../_lib";

// POST /api/caixa/fechar — fechamento CEGO da sessão do usuário logado:
// o operador informa o valor contado sem nunca ter visto o esperado; o servidor
// calcula esperado e divergência, fecha a sessão e devolve o resumo completo.

const schema = z.object({
  valorContado: z
    .number({ message: "valorContado deve ser um número" })
    .min(0, "Valor contado não pode ser negativo")
    .finite(),
});

export const POST = comAuth("CAIXA", async (req, _ctx, usuario) => {
  const { valorContado } = schema.parse(await req.json());
  const sessao = exigirSessaoAberta(await sessaoAbertaDoUsuario(usuario));

  const contado = arred2(valorContado);
  const agora = new Date();

  // Guarda contra fechamento duplo concorrente: só fecha se ainda estiver aberta.
  const fechadas = await prisma.sessaoCaixa.updateMany({
    where: { id: sessao.id, fechadaEm: null },
    data: { valorFechamento: contado, fechadaEm: agora },
  });
  if (fechadas.count !== 1) throw new ApiError(409, "Sessão já foi fechada");

  // Dados do resumo calculados DEPOIS da guarda (a sessão já está fechada).
  const [esperado, totaisPorForma] = await Promise.all([
    esperadoDinheiro(sessao, usuario),
    totaisPorFormaPagamento(sessao, usuario),
  ]);
  const divergencia = arred2(contado - esperado);
  const { totalSangrias, totalSuprimentos } = totaisMovimentos(sessao);

  await prisma.sessaoCaixa.update({
    where: { id: sessao.id },
    data: { divergencia },
  });

  return NextResponse.json({
    sessaoId: sessao.id,
    abertaEm: sessao.abertaEm.toISOString(),
    fechadaEm: agora.toISOString(),
    valorAbertura: Number(sessao.valorAbertura),
    totalSuprimentos,
    totalSangrias,
    esperado,
    contado,
    divergencia,
    totaisPorForma,
  });
});
