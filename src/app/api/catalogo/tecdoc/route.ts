import { NextRequest, NextResponse } from "next/server";
import { importarTecdocCsv } from "@/lib/catalogo/tecdoc";
import { empresaAtualId } from "@/lib/sessao";

// POST /api/catalogo/tecdoc
// Aceita multipart/form-data com até 5 arquivos:
//   manufacturers, models, types, articles, compatibilities
// Cada um é um CSV exportado do TecDoc ou de provedor compatível.

export async function POST(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const form = await req.formData();
  const ler = async (chave: string) => {
    const f = form.get(chave);
    if (!(f instanceof File)) return undefined;
    return await f.text();
  };
  const progresso = await importarTecdocCsv({
    empresaId,
    manufacturersCsv: await ler("manufacturers"),
    modelsCsv: await ler("models"),
    typesCsv: await ler("types"),
    articlesCsv: await ler("articles"),
    compatibilitiesCsv: await ler("compatibilities"),
  });
  return NextResponse.json(progresso);
}
