import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
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

export async function POST(req: NextRequest) {
  const body = schema.parse(await req.json());
  if (body.acao === "inscrever") {
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
    await notificarUsuario(body.alvoId, { titulo: body.titulo, corpo: body.corpo, url: body.url });
  } else {
    await notificarCliente(body.alvoId, { titulo: body.titulo, corpo: body.corpo, url: body.url });
  }
  return NextResponse.json({ ok: true });
}
