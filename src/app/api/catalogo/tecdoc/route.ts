import { NextResponse } from "next/server";
import { importarTecdocCsv } from "@/lib/catalogo/tecdoc";
import { comAuth } from "@/lib/auth/guard";

// POST /api/catalogo/tecdoc
// Aceita multipart/form-data com até 5 arquivos:
//   manufacturers, models, types, articles, compatibilities
// Cada um é um CSV exportado do TecDoc ou de provedor compatível.

export const POST = comAuth("GERENTE", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
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
});
