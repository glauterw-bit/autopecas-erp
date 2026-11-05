import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const ev: Record<string, unknown> = {
    id: "ev1", origem: "WHATSAPP", status: "PENDENTE", empresaId: "emp1", tentativas: 0,
    payload: { phoneNumberId: "P1", de: "5511999990000", texto: "oi" },
  };
  const prisma = {
    eventoWebhook: {
      updateMany: async ({ where, data }: { where: { status: { in: string[] } }; data: Record<string, unknown> }) => {
        if (!where.status.in.includes(ev.status as string)) return { count: 0 };
        ev.status = data.status;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ev,
      update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(ev, data),
    },
    cliente: { findFirst: async () => null },
    conversaIA: { create: async () => ({ id: "c1" }), update: async () => ({}) },
    mensagemIA: { create: async () => ({}), createMany: async () => ({}) },
  };
  return { ev, prisma, chat: vi.fn(async () => ({ resposta: "Temos sim." })), enviar: vi.fn(async () => undefined) };
});
vi.mock("../db", () => ({ prisma: h.prisma }));
vi.mock("../ai/chat", () => ({ conversarChat: h.chat }));
vi.mock("./whatsapp", () => ({ enviarTexto: h.enviar }));
vi.mock("../auth/rate-limit", () => ({ permitidoAsync: async () => true }));

import { processarMensagemWhatsapp } from "./whatsapp-inbound";

beforeEach(() => {
  h.ev.status = "PENDENTE";
  h.chat.mockClear();
  h.enviar.mockClear();
});

describe("processar mensagem do WhatsApp", () => {
  it("duas execuções simultâneas: a IA roda e responde uma vez só", async () => {
    const [a, b] = await Promise.all([processarMensagemWhatsapp("ev1"), processarMensagemWhatsapp("ev1")]);
    expect([a, b].sort()).toEqual(["ignorado", "respondido"]);
    expect(h.chat).toHaveBeenCalledTimes(1);
    expect(h.enviar).toHaveBeenCalledTimes(1);
    expect(h.enviar).toHaveBeenCalledWith(expect.objectContaining({ empresaId: "emp1", phoneNumberId: "P1", para: "5511999990000" }));
    expect(h.ev.status).toBe("PROCESSADO");
  });
  it("evento já processado não responde de novo", async () => {
    h.ev.status = "PROCESSADO";
    expect(await processarMensagemWhatsapp("ev1")).toBe("ignorado");
    expect(h.chat).not.toHaveBeenCalled();
  });
  it("falha ao enviar não refaz a IA (não cobra duas vezes)", async () => {
    h.enviar.mockRejectedValueOnce(new Error("Meta fora"));
    expect(await processarMensagemWhatsapp("ev1")).toBe("respondido-sem-envio");
    expect(h.chat).toHaveBeenCalledTimes(1);
    expect(h.ev.status).toBe("PROCESSADO");
  });
});
