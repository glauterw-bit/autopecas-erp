import { NextResponse } from "next/server";
import { consultarPlaca, vincularPlacaAoCliente } from "@/lib/catalogo/placa";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";

export const GET = comAuth("VENDEDOR", async (req) => {
  const placa = req.nextUrl.searchParams.get("placa");
  if (!placa) return NextResponse.json({ erro: "Informe a placa" }, { status: 400 });
  const dados = await consultarPlaca(placa);
  if (!dados) return NextResponse.json({ encontrado: false });
  return NextResponse.json({ encontrado: true, dados });
});

export const POST = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  const { placa, clienteId } = (await req.json()) as { placa: string; clienteId: string };
  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, empresaId: usuario.empresaId },
    select: { id: true },
  });
  if (!cliente) throw new ApiError(404, "Cliente não encontrado");
  const veiculo = await vincularPlacaAoCliente(cliente.id, placa);
  return NextResponse.json(veiculo);
});
