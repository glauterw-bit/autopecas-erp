import { NextResponse } from "next/server";
import { identificarPecaPorImagem } from "@/lib/ai/vision";
import { buscarEquivalentes } from "@/lib/ai/cross-reference";
import { exigirLimiteIA } from "@/lib/ai/limite";
import { comAuth } from "@/lib/auth/guard";

const MAX_FOTOS = 4;
const MAX_BYTES = 8 * 1024 * 1024;

export const POST = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  await exigirLimiteIA("vision", usuario.id);
  const form = await req.formData();
  const fotos = form.getAll("foto").filter((f): f is File => f instanceof File);
  if (fotos.length === 0)
    return NextResponse.json({ erro: "Envie ao menos uma foto" }, { status: 400 });
  if (fotos.length > MAX_FOTOS)
    return NextResponse.json({ erro: `Envie no máximo ${MAX_FOTOS} fotos` }, { status: 400 });

  const imagens: string[] = [];
  let mime: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg";
  for (const f of fotos) {
    if (f.size > MAX_BYTES)
      return NextResponse.json({ erro: "Foto maior que 8 MB" }, { status: 400 });
    if (f.type === "image/png") mime = "image/png";
    else if (f.type === "image/webp") mime = "image/webp";
    const buf = Buffer.from(await f.arrayBuffer());
    imagens.push(buf.toString("base64"));
  }

  const identificacao = await identificarPecaPorImagem(empresaId, imagens, mime);

  // Tenta achar correspondentes no catálogo da loja.
  const sugestoes = await buscarEquivalentes(empresaId, {
    nome: identificacao.termosBuscaSugeridos.join(" ") || identificacao.categoria,
    marca: identificacao.marca,
    codigoOem: identificacao.codigoOemLido,
    codigoFabricante: identificacao.codigoFabricanteLido,
    sistema: identificacao.sistema,
  }).catch(() => []);

  return NextResponse.json({ identificacao, sugestoes });
});
