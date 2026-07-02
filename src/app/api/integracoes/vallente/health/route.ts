import { NextRequest, NextResponse } from "next/server";
import { empresaPorApiKey, respostaErro } from "@/lib/auth/guard";

// Health check consumido pelo testConnection() do provider "custom" do
// Vallente Hub — valida a API key e devolve a identidade da empresa.

export async function GET(req: NextRequest) {
  try {
    const empresa = await empresaPorApiKey(req);
    return NextResponse.json({
      ok: true,
      sistema: "autopecas-erp",
      empresa: empresa.razaoSocial,
    });
  } catch (e) {
    return respostaErro(e);
  }
}
