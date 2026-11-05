import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, comAuth } from "@/lib/auth/guard";
import {
  gerarTotpSecret,
  urlOtpAuth,
  verificarSenha,
  verificarTotp,
} from "@/lib/auth/config";
import { permitidoAsync } from "@/lib/auth/rate-limit";
import { registrarAuditoria } from "@/lib/auth/auditoria";

// 2FA (TOTP) do próprio usuário.
//  iniciar   → gera o segredo (ainda não salva)
//  confirmar → salva o segredo com o primeiro código; se já existe 2FA, exige o código atual
//  desativar → exige o código atual (e a senha, se enviada, tem que estar certa)
const schema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("iniciar") }),
  z.object({
    acao: z.literal("confirmar"),
    secret: z.string().regex(/^[A-Z2-7]{16,64}$/),
    codigo: z.string().regex(/^\d{6}$/),
    codigoAtual: z.string().regex(/^\d{6}$/).optional(),
  }),
  z.object({
    acao: z.literal("desativar"),
    codigo: z.string().regex(/^\d{6}$/),
    senha: z.string().optional(),
  }),
]);

export const POST = comAuth(null, async (req: NextRequest, _ctx, sessao) => {
  const body = schema.parse(await req.json());
  const u = await prisma.usuario.findFirst({
    where: { id: sessao.id, empresaId: sessao.empresaId },
    select: { id: true, email: true, totpSecret: true, senhaHash: true },
  });
  if (!u) throw new ApiError(401, "Não autenticado");

  if (body.acao === "iniciar") {
    const secret = gerarTotpSecret();
    return NextResponse.json({ secret, url: urlOtpAuth(u.email, secret) });
  }

  // Mexer no 2FA conta como tentativa de código: 10 a cada 15 minutos por usuário.
  if (!(await permitidoAsync(`2fa:${u.id}`, 10, 15 * 60 * 1000))) {
    throw new ApiError(429, "Muitas tentativas. Aguarde 15 minutos.");
  }

  if (body.acao === "confirmar") {
    if (u.totpSecret) {
      if (!body.codigoAtual || !verificarTotp(u.totpSecret, body.codigoAtual)) {
        throw new ApiError(403, "Para trocar o 2FA, digite o código atual.");
      }
    }
    if (!verificarTotp(body.secret, body.codigo)) throw new ApiError(400, "Código inválido");
    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id: u.id }, data: { totpSecret: body.secret } });
      await registrarAuditoria(tx, {
        empresaId: sessao.empresaId,
        usuarioId: u.id,
        acao: u.totpSecret ? "2FA_TROCADO" : "2FA_ATIVADO",
        entidade: "Usuario",
        entidadeId: u.id,
        antes: { doisFatores: !!u.totpSecret },
        depois: { doisFatores: true },
      });
    });
    return NextResponse.json({ ok: true });
  }

  // desativar
  if (!u.totpSecret) return NextResponse.json({ ok: true });
  if (!verificarTotp(u.totpSecret, body.codigo)) throw new ApiError(403, "Código inválido");
  if (body.senha !== undefined && !verificarSenha(body.senha, u.senhaHash)) {
    throw new ApiError(403, "Senha incorreta");
  }
  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: u.id }, data: { totpSecret: null } });
    await registrarAuditoria(tx, {
      empresaId: sessao.empresaId,
      usuarioId: u.id,
      acao: "2FA_DESATIVADO",
      entidade: "Usuario",
      entidadeId: u.id,
      antes: { doisFatores: true },
      depois: { doisFatores: false },
    });
  });
  return NextResponse.json({ ok: true });
});
