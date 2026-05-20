import { NextRequest, NextResponse } from "next/server";
import { BalancaLocalClient, type ModeloBalanca } from "@/lib/pdv/balanca";

// Proxy: o front chama este endpoint, que repassa para o Agente Local do PDV.
// Em produção, o front pode chamar 127.0.0.1 direto — este é alternativa
// quando o agente está em rede separada (loja com múltiplos balcões).

const cliente = new BalancaLocalClient();

export async function GET(req: NextRequest) {
  const modelo = (req.nextUrl.searchParams.get("modelo") ?? "TOLEDO_PRIX_III") as ModeloBalanca;
  const estavel = req.nextUrl.searchParams.get("estavel") === "true";
  try {
    const leitura = estavel
      ? await cliente.lerPesoEstavel(modelo)
      : await cliente.lerPeso(modelo);
    return NextResponse.json(leitura);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 });
  }
}
