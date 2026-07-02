import { NextResponse } from "next/server";
import { importarXmlNfeEntrada } from "@/lib/nfe/importar-xml";
import { comAuth } from "@/lib/auth/guard";

export const POST = comAuth("ESTOQUISTA", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const form = await req.formData();
  const arq = form.get("xml");
  if (!(arq instanceof File))
    return NextResponse.json({ erro: "Envie o XML da NF-e em 'xml'" }, { status: 400 });
  const texto = await arq.text();
  const result = await importarXmlNfeEntrada({ empresaId, xml: texto });
  return NextResponse.json(result);
});
