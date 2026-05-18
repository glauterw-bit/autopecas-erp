import { NextRequest, NextResponse } from "next/server";
import { identificarPecaPorImagem } from "@/lib/ai/vision";
import { buscarEquivalentes } from "@/lib/ai/cross-reference";
import { empresaAtualId } from "@/lib/sessao";

export async function POST(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const form = await req.formData();
  const fotos = form.getAll("foto");
  if (fotos.length === 0)
    return NextResponse.json({ erro: "Envie ao menos uma foto" }, { status: 400 });

  const imagens: string[] = [];
  let mime: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg";
  for (const f of fotos) {
    if (!(f instanceof File)) continue;
    if (f.type === "image/png") mime = "image/png";
    else if (f.type === "image/webp") mime = "image/webp";
    const buf = Buffer.from(await f.arrayBuffer());
    imagens.push(buf.toString("base64"));
  }

  const identificacao = await identificarPecaPorImagem(imagens, mime);

  // Tenta achar correspondentes no catálogo da loja.
  const sugestoes = await buscarEquivalentes(empresaId, {
    nome: identificacao.termosBuscaSugeridos.join(" "),
    marca: identificacao.marca,
    codigoOem: identificacao.codigoOemLido,
    codigoFabricante: identificacao.codigoFabricanteLido,
    sistema: identificacao.sistema,
  }).catch(() => []);

  return NextResponse.json({ identificacao, sugestoes });
}
