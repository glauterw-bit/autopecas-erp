import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { comAuth } from "@/lib/auth/guard";

// Gestão da API key da integração Vallente Hub (só ADMIN).
// POST gera/rotaciona a chave — ela é exibida uma única vez na resposta.
// GET mostra apenas se existe e o sufixo, nunca a chave inteira.

export const GET = comAuth("ADMIN", async (_req, _ctx, usuario) => {
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: usuario.empresaId },
    select: { vallenteApiKey: true },
  });
  return NextResponse.json({
    configurada: Boolean(empresa.vallenteApiKey),
    sufixo: empresa.vallenteApiKey?.slice(-6) ?? null,
  });
});

export const POST = comAuth("ADMIN", async (_req, _ctx, usuario) => {
  const chave = `vlt_${crypto.randomBytes(32).toString("base64url")}`;
  await prisma.empresa.update({
    where: { id: usuario.empresaId },
    data: { vallenteApiKey: chave },
  });
  return NextResponse.json({
    chave,
    aviso: "Guarde agora — a chave não será exibida novamente.",
    comoUsar: {
      provider: "custom",
      baseUrl: `${process.env.APP_URL ?? "https://autopecas-app-production.up.railway.app"}/api/integracoes/vallente`,
      header: "X-API-Key",
    },
  });
});

export const DELETE = comAuth("ADMIN", async (_req, _ctx, usuario) => {
  await prisma.empresa.update({
    where: { id: usuario.empresaId },
    data: { vallenteApiKey: null },
  });
  return NextResponse.json({ ok: true });
});
