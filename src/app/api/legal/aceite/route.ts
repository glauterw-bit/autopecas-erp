import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, comAuth } from "@/lib/auth/guard";
import { ipDoCliente } from "@/lib/auth/ip";
import { aceitePendente, registrarAceite } from "@/lib/legal/aceite";
import { TERMOS_VERSAO } from "@/lib/legal/versao";

// Qualquer usuário logado pode ver e aceitar os termos (perfil não importa).
export const GET = comAuth(null, async (_req, _ctx, usuario) => {
  return NextResponse.json({
    versao: TERMOS_VERSAO,
    pendente: await aceitePendente(prisma, usuario.id),
  });
});

const corpo = z.object({ versao: z.string() });

export const POST = comAuth(null, async (req, _ctx, usuario) => {
  const { versao } = corpo.parse(await req.json().catch(() => ({})));
  if (versao !== TERMOS_VERSAO) {
    throw new ApiError(409, "Os termos foram atualizados. Recarregue a página e leia a versão nova.");
  }
  await registrarAceite(
    prisma,
    {
      usuarioId: usuario.id,
      empresaId: usuario.empresaId,
      ip: ipDoCliente(req),
      userAgent: req.headers.get("user-agent"),
    },
    versao,
  );
  return NextResponse.json({ ok: true, versao });
});
