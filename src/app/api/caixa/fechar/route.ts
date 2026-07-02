import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth } from "@/lib/auth/guard";
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

  const [esperado, totaisPorForma] = await Promise.all([
    esperadoDinheiro(sessao, usuario),
    totaisPorFormaPagamento(sessao, usuario),
  ]);
  const contado = arred2(valorContado);
  const divergencia = arred2(contado - esperado);
  const { totalSangrias, totalSuprimentos } = totaisMovimentos(sessao);

  const fechada = await prisma.sessaoCaixa.update({
    where: { id: sessao.id },
    data: { valorFechamento: contado, divergencia, fechadaEm: new Date() },
    select: { id: true, abertaEm: true, fechadaEm: true, valorAbertura: true },
  });

  return NextResponse.json({
    sessaoId: fechada.id,
    abertaEm: fechada.abertaEm.toISOString(),
    fechadaEm: fechada.fechadaEm!.toISOString(),
    valorAbertura: Number(fechada.valorAbertura),
    totalSuprimentos,
    totalSangrias,
    esperado,
    contado,
    divergencia,
    totaisPorForma,
  });
});
