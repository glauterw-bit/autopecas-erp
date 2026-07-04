import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { arred2, esperadoDinheiro, exigirSessaoAberta, sessaoAbertaDoUsuario } from "../_lib";

// POST /api/caixa/movimento — registra sangria ou suprimento (em dinheiro)
// na sessão aberta do usuário logado.

const schema = z.object({
  tipo: z.enum(["SANGRIA", "SUPRIMENTO"], { message: "tipo deve ser SANGRIA ou SUPRIMENTO" }),
  valor: z
    .number({ message: "valor deve ser um número" })
    .positive("Valor deve ser maior que zero")
    .finite(),
  descricao: z.string().trim().max(500).optional(),
});

export const POST = comAuth("CAIXA", async (req, _ctx, usuario) => {
  const body = schema.parse(await req.json());
  const sessao = exigirSessaoAberta(await sessaoAbertaDoUsuario(usuario));

  // Sangria acima de R$ 0 sempre exige justificativa
  if (body.tipo === "SANGRIA" && body.valor > 0 && !body.descricao) {
    throw new ApiError(400, "Sangria exige uma descrição (motivo da retirada)");
  }

  // Sangria não pode retirar mais do que há em dinheiro no caixa
  if (body.tipo === "SANGRIA") {
    const emCaixa = await esperadoDinheiro(sessao, usuario);
    if (arred2(body.valor) > emCaixa) {
      throw new ApiError(
        422,
        `Sangria maior que o dinheiro em caixa (disponível: R$ ${emCaixa.toFixed(2)})`,
      );
    }
  }

  const movimento = await prisma.movimentoCaixa.create({
    data: {
      empresaId: usuario.empresaId,
      sessaoCaixaId: sessao.id,
      usuarioId: usuario.id,
      tipo: body.tipo,
      formaPagamento: "DINHEIRO",
      valor: arred2(body.valor),
      descricao:
        body.descricao ||
        (body.tipo === "SUPRIMENTO" ? "Suprimento de caixa" : "Sangria de caixa"),
    },
    select: { id: true, tipo: true, valor: true, descricao: true, data: true },
  });

  return NextResponse.json(
    { ...movimento, valor: Number(movimento.valor), data: movimento.data.toISOString() },
    { status: 201 },
  );
});
