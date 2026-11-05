import { Readable } from "node:stream";
import { prisma } from "@/lib/db";
import { ApiError, comAuth } from "@/lib/auth/guard";
import { permitidoAsync } from "@/lib/auth/rate-limit";
import { registrarAuditoria } from "@/lib/auth/auditoria";
import { entradasExportacao } from "@/lib/lgpd/exportar-empresa";
import { gerarZip } from "@/lib/lgpd/zip";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Exportação de todos os dados da empresa (ZIP com CSVs e XMLs). Só ADMIN.
// MVP: gera na hora e entrega em streaming. Se a base ficar grande demais para
// isso, o próximo passo é gerar por fila e avisar por e-mail.
export const GET = comAuth("ADMIN", async (_req, _ctx, usuario) => {
  // 3 por hora por empresa: a leitura é pesada.
  if (!(await permitidoAsync(`lgpd:exportar:${usuario.empresaId}`, 3, 60 * 60_000))) {
    throw new ApiError(429, "Você já pediu a exportação algumas vezes agora há pouco. Tente de novo daqui a uma hora.");
  }
  const contagem: Record<string, number> = {};
  const zip = gerarZip(entradasExportacao(prisma, usuario.empresaId, contagem));
  // Grava a auditoria antes de começar a enviar: sem registro, sem exportação.
  await registrarAuditoria(prisma, {
    empresaId: usuario.empresaId,
    usuarioId: usuario.id,
    acao: "LGPD_EXPORTAR_EMPRESA",
    entidade: "Empresa",
    entidadeId: usuario.empresaId,
  });
  const nome = `dados-da-empresa-${new Date().toISOString().slice(0, 10)}.zip`;
  return new Response(Readable.toWeb(Readable.from(zip)) as ReadableStream, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${nome}"`,
      "cache-control": "no-store",
    },
  });
});
