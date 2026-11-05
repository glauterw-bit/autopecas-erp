import { NextResponse } from "next/server";
import { ApiError, comAuth } from "@/lib/auth/guard";
import { receberCertificado, telaConfigFiscal } from "@/lib/nfe/config-fiscal-servico";

// Recebe o certificado A1 (.pfx + senha) por multipart. O arquivo e a senha
// são usados só nesta requisição (leitura da validade e envio à Focus) e não
// são gravados nem registrados em log.
export const POST = comAuth("FINANCEIRO", async (req, _ctx, usuario) => {
  const form = await req.formData().catch(() => null);
  if (!form) throw new ApiError(400, "Envie o arquivo do certificado e a senha.");
  const arquivo = form.get("arquivo");
  const senha = form.get("senha");
  if (!(arquivo instanceof Blob)) throw new ApiError(400, "Escolha o arquivo do certificado (.pfx ou .p12).");
  if (typeof senha !== "string") throw new ApiError(400, "Informe a senha do certificado.");
  const r = await receberCertificado(usuario.empresaId, usuario.id, {
    arquivo: Buffer.from(await arquivo.arrayBuffer()),
    senha,
    enviarParaFocus: form.get("enviarFocus") === "1",
  });
  return NextResponse.json({ ...r, tela: await telaConfigFiscal(usuario.empresaId) });
});
