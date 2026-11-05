import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, comAuth } from "@/lib/auth/guard";
import { permitidoAsync } from "@/lib/auth/rate-limit";
import { anonimizarCliente, exportarDadosDoCliente } from "@/lib/lgpd/titular";

export const dynamic = "force-dynamic";

// Pedido do titular (cliente final da loja). GERENTE ou acima; tudo vai para o
// LogAuditoria. A loja é a controladora desses dados.
const limite = async (empresaId: string) => {
  if (!(await permitidoAsync(`lgpd:titular:${empresaId}`, 30, 60 * 60_000))) {
    throw new ApiError(429, "Muitos pedidos seguidos. Tente de novo daqui a pouco.");
  }
};

// GET /api/lgpd/titular?clienteId=... → JSON com os dados do cliente
export const GET = comAuth("GERENTE", async (req, _ctx, usuario) => {
  await limite(usuario.empresaId);
  const clienteId = new URL(req.url).searchParams.get("clienteId");
  if (!clienteId) throw new ApiError(400, "Informe o clienteId");
  const dados = await exportarDadosDoCliente(prisma, usuario.empresaId, clienteId, usuario.id);
  return new Response(JSON.stringify(dados, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="dados-do-cliente-${clienteId}.json"`,
      "cache-control": "no-store",
    },
  });
});

const corpo = z.object({ clienteId: z.string().min(1), acao: z.literal("ANONIMIZAR") });

// POST { clienteId, acao: "ANONIMIZAR" } → remove os dados pessoais do cliente
export const POST = comAuth("GERENTE", async (req, _ctx, usuario) => {
  await limite(usuario.empresaId);
  const { clienteId } = corpo.parse(await req.json().catch(() => ({})));
  const r = await anonimizarCliente(prisma, usuario.empresaId, clienteId, usuario.id);
  return NextResponse.json({
    ok: true,
    mensagem: r.jaAnonimizado
      ? "Este cliente já estava sem dados pessoais."
      : "Dados pessoais removidos. As vendas e as notas continuam, como a lei exige.",
  });
});
