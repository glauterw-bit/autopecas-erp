import { NextResponse } from "next/server";
import { extrairNfEntrada } from "@/lib/ai/ocr-nf";
import { exigirLimiteIA } from "@/lib/ai/limite";
import { comAuth } from "@/lib/auth/guard";

const MAX_ARQUIVOS = 5;
const MAX_BYTES = 10 * 1024 * 1024;

export const POST = comAuth("ESTOQUISTA", async (req, _ctx, usuario) => {
  await exigirLimiteIA("ocrNf", usuario.id);
  const form = await req.formData();
  const arquivos = form.getAll("arquivo").filter((a): a is File => a instanceof File);
  if (arquivos.length === 0)
    return NextResponse.json({ erro: "Envie ao menos um arquivo" }, { status: 400 });
  if (arquivos.length > MAX_ARQUIVOS)
    return NextResponse.json({ erro: `Envie no máximo ${MAX_ARQUIVOS} arquivos` }, { status: 400 });

  const inputs: Array<{ base64: string; tipo: "image/jpeg" | "image/png" | "application/pdf" }> = [];
  for (const a of arquivos) {
    if (a.size > MAX_BYTES)
      return NextResponse.json({ erro: "Arquivo maior que 10 MB" }, { status: 400 });
    const tipo =
      a.type === "application/pdf" || a.type === "image/png" || a.type === "image/jpeg"
        ? (a.type as "image/jpeg" | "image/png" | "application/pdf")
        : "image/jpeg";
    const buf = Buffer.from(await a.arrayBuffer());
    inputs.push({ base64: buf.toString("base64"), tipo });
  }
  const nfe = await extrairNfEntrada(usuario.empresaId, inputs);
  return NextResponse.json(nfe);
});
