import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, comAuth } from "@/lib/auth/guard";
import { lerCsv } from "@/lib/implantacao/csv";
import { aplicarMapa, camposObrigatoriosFaltando } from "@/lib/implantacao/mapa";
import { importar } from "@/lib/implantacao/importar";
import { corpoBase } from "../esquema";

export const maxDuration = 300;

const corpo = corpoBase.extend({
  mapa: z.record(z.string(), z.string().nullable()),
  simular: z.boolean(),
  deposito: z.string().max(80).optional(),
  arquivoNome: z.string().max(200).optional(),
});

// Simula ou aplica a importação. empresaId e usuário vêm SEMPRE da sessão.
export const POST = comAuth("ADMIN", async (req, _ctx, usuario) => {
  const body = corpo.parse(await req.json());
  const faltando = camposObrigatoriosFaltando(body.entidade, body.mapa);
  if (faltando.length) throw new ApiError(400, `Escolha a coluna de: ${faltando.join(", ")}`);
  const csv = lerCsv(body.csv);
  const r = await importar(prisma, {
    empresaId: usuario.empresaId,
    usuarioId: usuario.id,
    entidade: body.entidade,
    registros: aplicarMapa(body.entidade, csv, body.mapa),
    simular: body.simular,
    origem: "CSV",
    arquivoNome: body.arquivoNome,
    depositoPadrao: body.deposito,
  });
  return NextResponse.json({ ...r, problemas: r.problemas.slice(0, 300), totalProblemas: r.problemas.length });
});
