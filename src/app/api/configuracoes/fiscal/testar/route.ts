import { NextResponse } from "next/server";
import { comAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { testarConfiguracaoFocus } from "@/lib/nfe/focus-empresas";
import { gravarRetornoTeste, telaConfigFiscal } from "@/lib/nfe/config-fiscal-servico";

// "Testar configuração": consulta a Focus em homologação SEM emitir nota.
export const POST = comAuth("FINANCEIRO", async (_req, _ctx, usuario) => {
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: usuario.empresaId },
    select: { cnpj: true, configuracoes: true },
  });
  const r = await testarConfiguracaoFocus(empresa);
  if (r.empresaFocus?.certificadoValidoAte) await gravarRetornoTeste(usuario.empresaId, usuario.id, r.empresaFocus);
  return NextResponse.json({ ok: r.ok, etapas: r.etapas, tela: await telaConfigFiscal(usuario.empresaId) });
});
