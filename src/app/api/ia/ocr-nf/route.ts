import { NextRequest, NextResponse } from "next/server";
import { extrairNfEntrada } from "@/lib/ai/ocr-nf";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const arquivos = form.getAll("arquivo");
  const inputs: Array<{ base64: string; tipo: "image/jpeg" | "image/png" | "application/pdf" }> = [];
  for (const a of arquivos) {
    if (!(a instanceof File)) continue;
    const buf = Buffer.from(await a.arrayBuffer());
    const tipo =
      a.type === "application/pdf" || a.type === "image/png" || a.type === "image/jpeg"
        ? (a.type as "image/jpeg" | "image/png" | "application/pdf")
        : "image/jpeg";
    inputs.push({ base64: buf.toString("base64"), tipo });
  }
  if (inputs.length === 0)
    return NextResponse.json({ erro: "Envie ao menos um arquivo" }, { status: 400 });
  const nfe = await extrairNfEntrada(inputs);
  return NextResponse.json(nfe);
}
