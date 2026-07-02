import { NextResponse } from "next/server";
import { importarTafXml } from "@/lib/catalogo/tecdoc-xml";
import { sincronizarTecdocEmpresa } from "@/lib/catalogo/tecdoc-sync";
import { comAuth } from "@/lib/auth/guard";

export const POST = comAuth("GERENTE", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const tipoConteudo = req.headers.get("content-type") ?? "";

  // multipart com arquivo XML
  if (tipoConteudo.includes("multipart/form-data")) {
    const form = await req.formData();
    const arq = form.get("xml");
    if (!(arq instanceof File))
      return NextResponse.json({ erro: "Envie um arquivo XML em 'xml'" }, { status: 400 });
    const texto = await arq.text();
    const out = await importarTafXml({ empresaId, xml: texto });
    return NextResponse.json(out);
  }

  // pull automático da URL configurada
  const out = await sincronizarTecdocEmpresa(empresaId);
  return NextResponse.json(out);
});
