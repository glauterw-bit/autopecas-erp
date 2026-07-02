import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";

export const GET = comAuth("FINANCEIRO", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const tipo = req.nextUrl.searchParams.get("tipo") ?? "receber";
  if (tipo === "receber") {
    const itens = await prisma.contaReceber.findMany({
      where: { empresaId },
      include: { cliente: true },
      orderBy: { dataVencimento: "asc" },
      take: 200,
    });
    return NextResponse.json(itens);
  }
  if (tipo === "pagar") {
    const itens = await prisma.contaPagar.findMany({
      where: { empresaId },
      include: { fornecedor: true },
      orderBy: { dataVencimento: "asc" },
      take: 200,
    });
    return NextResponse.json(itens);
  }
  if (tipo === "fluxo") {
    const inicio = new Date();
    inicio.setDate(1);
    const movimentos = await prisma.movimentoCaixa.findMany({
      where: { empresaId, data: { gte: inicio } },
      orderBy: { data: "asc" },
      take: 500,
    });
    return NextResponse.json(movimentos);
  }
  return NextResponse.json({ erro: "tipo inválido" }, { status: 400 });
});

const baixaSchema = z.object({
  tipo: z.enum(["receber", "pagar"]),
  id: z.string(),
  valor: z.number().positive(),
  contaBancariaId: z.string().optional(),
  data: z.string().optional(),
});

export const POST = comAuth("FINANCEIRO", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const body = baixaSchema.parse(await req.json());
  const data = body.data ? new Date(body.data) : new Date();
  if (body.tipo === "receber") {
    const c = await prisma.contaReceber.findFirst({ where: { id: body.id, empresaId } });
    if (!c) throw new ApiError(404, "Conta a receber não encontrada");
    const novo = Number(c.valorRecebido) + body.valor;
    const status = novo >= Number(c.valor) ? "PAGO" : "PARCIALMENTE_PAGO";
    const out = await prisma.contaReceber.update({
      where: { id: c.id },
      data: {
        valorRecebido: novo,
        status,
        dataRecebimento: status === "PAGO" ? data : undefined,
        contaBancariaId: body.contaBancariaId,
      },
    });
    await prisma.movimentoCaixa.create({
      data: {
        empresaId,
        contaBancariaId: body.contaBancariaId,
        tipo: "ENTRADA",
        valor: body.valor,
        descricao: c.descricao,
        data,
      },
    });
    return NextResponse.json(out);
  } else {
    const c = await prisma.contaPagar.findFirst({ where: { id: body.id, empresaId } });
    if (!c) throw new ApiError(404, "Conta a pagar não encontrada");
    const novo = Number(c.valorPago) + body.valor;
    const status = novo >= Number(c.valor) ? "PAGO" : "PARCIALMENTE_PAGO";
    const out = await prisma.contaPagar.update({
      where: { id: c.id },
      data: {
        valorPago: novo,
        status,
        dataPagamento: status === "PAGO" ? data : undefined,
        contaBancariaId: body.contaBancariaId,
      },
    });
    await prisma.movimentoCaixa.create({
      data: {
        empresaId,
        contaBancariaId: body.contaBancariaId,
        tipo: "SAIDA",
        valor: body.valor,
        descricao: c.descricao,
        data,
      },
    });
    return NextResponse.json(out);
  }
});
