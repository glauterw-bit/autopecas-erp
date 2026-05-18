import { NextRequest, NextResponse } from "next/server";
import { consultarPlaca, vincularPlacaAoCliente } from "@/lib/catalogo/placa";

export async function GET(req: NextRequest) {
  const placa = req.nextUrl.searchParams.get("placa");
  if (!placa) return NextResponse.json({ erro: "Informe a placa" }, { status: 400 });
  const dados = await consultarPlaca(placa);
  if (!dados) return NextResponse.json({ encontrado: false });
  return NextResponse.json({ encontrado: true, dados });
}

export async function POST(req: NextRequest) {
  const { placa, clienteId } = (await req.json()) as { placa: string; clienteId: string };
  const veiculo = await vincularPlacaAoCliente(clienteId, placa);
  return NextResponse.json(veiculo);
}
