import { NextRequest, NextResponse } from "next/server";
import { conciliarExtrato } from "@/lib/financeiro/conciliacao";
import { parseOFX } from "@/lib/financeiro/ofx";
import { empresaAtualId } from "@/lib/sessao";

export async function POST(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const form = await req.formData();
  const arquivo = form.get("ofx");
  const contaBancariaId = String(form.get("contaBancariaId") ?? "");
  if (!(arquivo instanceof File))
    return NextResponse.json({ erro: "Envie o arquivo OFX em 'ofx'" }, { status: 400 });
  if (!contaBancariaId)
    return NextResponse.json({ erro: "Informe contaBancariaId" }, { status: 400 });

  const texto = await arquivo.text();
  const extrato = parseOFX(texto);
  const result = await conciliarExtrato({ empresaId, contaBancariaId, extrato });
  return NextResponse.json(result);
}
