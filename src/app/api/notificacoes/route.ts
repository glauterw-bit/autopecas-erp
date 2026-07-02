import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { notificarUsuario, notificarCliente } from "@/lib/notificacoes/push";

const subSchema = z.object({
  acao: z.literal("inscrever"),
  endpoint: z.string().url(),
  p256dh: z.string(),
  authKey: z.string(),
  usuarioId: z.string().optional(),
  clienteId: z.string().optional(),
  userAgent: z.string().optional(),
});
const envSchema = z.object({
  acao: z.literal("enviar"),
  alvo: z.enum(["usuario", "cliente"]),
  alvoId: z.string(),
  titulo: z.string(),
  corpo: z.string(),
  url: z.string().optional(),
});
const schema = z.discriminatedUnion("acao", [subSchema, envSchema]);

// Garante que usuário/cliente alvo pertencem à empresa da sessão.
async function validarUsuarioDaEmpresa(id: string, empresaId: string) {
  const u = await prisma.usuario.findFirst({ where: { id, empresaId }, select: { id: true } });
  if (!u) throw new ApiError(404, "Usuário não encontrado");
}
async function validarClienteDaEmpresa(id: string, empresaId: string) {
  const c = await prisma.cliente.findFirst({ where: { id, empresaId }, select: { id: true } });
  if (!c) throw new ApiError(404, "Cliente não encontrado");
}

export const POST = comAuth("ESTOQUISTA", async (req, _ctx, usuario) => {
  const body = schema.parse(await req.json());
  if (body.acao === "inscrever") {
    if (body.usuarioId) await validarUsuarioDaEmpresa(body.usuarioId, usuario.empresaId);
    if (body.clienteId) await validarClienteDaEmpresa(body.clienteId, usuario.empresaId);
    const sub = await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: { ativa: true, p256dh: body.p256dh, authKey: body.authKey },
      create: {
        endpoint: body.endpoint,
        p256dh: body.p256dh,
        authKey: body.authKey,
        usuarioId: body.usuarioId,
        clienteId: body.clienteId,
        userAgent: body.userAgent,
        plataforma: "WEB",
      },
    });
    return NextResponse.json({ id: sub.id });
  }
  if (body.alvo === "usuario") {
    await validarUsuarioDaEmpresa(body.alvoId, usuario.empresaId);
    await notificarUsuario(body.alvoId, { titulo: body.titulo, corpo: body.corpo, url: body.url });
  } else {
    await validarClienteDaEmpresa(body.alvoId, usuario.empresaId);
    await notificarCliente(body.alvoId, { titulo: body.titulo, corpo: body.corpo, url: body.url });
  }
  return NextResponse.json({ ok: true });
});
