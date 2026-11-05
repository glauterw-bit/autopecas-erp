import { NextResponse } from "next/server";
import { z } from "zod";
import { comAuth } from "@/lib/auth/guard";
import { estenderTrial, exigirAdminSaas, listarLojas, mudarPlano, reativar, suspender } from "@/lib/assinatura/admin-saas";

// Painel do dono do SaaS. Passa por comAuth (sessão válida) e, além disso, o
// e-mail precisa estar em SAAS_ADMIN_EMAILS; o perfil da loja não conta.
export const GET = comAuth(null, async (_req, _ctx, usuario) => {
  exigirAdminSaas(usuario.email);
  return NextResponse.json(await listarLojas());
});

const acaoSchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("ESTENDER_TRIAL"), empresaId: z.string().min(1), dias: z.number().int().min(1).max(90) }),
  z.object({ acao: z.literal("MUDAR_PLANO"), empresaId: z.string().min(1), planoCodigo: z.string().min(1) }),
  z.object({ acao: z.literal("SUSPENDER"), empresaId: z.string().min(1), motivo: z.string().trim().min(3).max(200), forcar: z.boolean().default(false) }),
  z.object({ acao: z.literal("REATIVAR"), empresaId: z.string().min(1) }),
]);

export const POST = comAuth(null, async (req, _ctx, usuario) => {
  exigirAdminSaas(usuario.email);
  const b = acaoSchema.parse(await req.json());
  const ator = { id: usuario.id, empresaId: usuario.empresaId };
  switch (b.acao) {
    case "ESTENDER_TRIAL":
      return NextResponse.json(await estenderTrial(ator, b.empresaId, b.dias));
    case "MUDAR_PLANO":
      return NextResponse.json(await mudarPlano(ator, b.empresaId, b.planoCodigo));
    case "SUSPENDER":
      return NextResponse.json(await suspender(ator, b.empresaId, b.motivo, b.forcar));
    case "REATIVAR":
      return NextResponse.json(await reativar(ator, b.empresaId));
  }
});
