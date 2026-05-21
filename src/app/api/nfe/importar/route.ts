import { NextRequest, NextResponse } from "next/server";
import { importarXmlNfeEntrada } from "@/lib/nfe/importar-xml";
import { empresaAtualId } from "@/lib/sessao";

export async function POST(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const form = await req.formData();
  const arq = form.get("xml");
  if (!(arq instanceof File))
    return NextResponse.json({ erro: "Envie o XML da NF-e em 'xml'" }, { status: 400 });
  const texto = await arq.text();
  try {
    const result = await importarXmlNfeEntrada({ empresaId, xml: texto });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 });
  }
}
