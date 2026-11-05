import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A resposta sai antes do trabalho (busca do usuário, token, e-mail): o tempo de
// resposta não revela se o e-mail existe.

const depois = vi.hoisted(() => ({ tarefas: [] as Array<() => Promise<void>> }));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => Promise<void>) => void depois.tarefas.push(fn),
}));
const db = vi.hoisted(() => ({ prisma: { usuario: { findFirst: vi.fn() } } }));
vi.mock("@/lib/db", () => ({ prisma: db.prisma }));
vi.mock("@/lib/auth/rate-limit", () => ({ permitidoAsync: vi.fn(async () => true) }));
const contas = vi.hoisted(() => ({ criarTokenConta: vi.fn(async () => ({ token: "tok" })), urlDoLink: vi.fn(() => "https://x/link") }));
vi.mock("@/lib/auth/contas", () => contas);
const email = vi.hoisted(() => ({ emailConfigurado: vi.fn(() => true), enviarEmail: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/email", () => email);

import { POST } from "./route";

const chamar = (e: string) =>
  POST(new NextRequest("https://erp.exemplo.com.br/api/auth/esqueci", { method: "POST", body: JSON.stringify({ email: e }), headers: { "x-forwarded-for": "9.9.9.9, 203.0.113.5" } }));

beforeEach(() => {
  vi.clearAllMocks();
  depois.tarefas.length = 0;
  email.emailConfigurado.mockReturnValue(true);
});

describe("POST /api/auth/esqueci", () => {
  it("responde igual e sem tocar no banco nem no e-mail antes de responder; o envio roda depois", async () => {
    db.prisma.usuario.findFirst.mockResolvedValue({ id: "u1", nome: "Ana", email: "ana@x.com" });
    const r = await chamar("ana@x.com");
    expect(r.status).toBe(200);
    expect(db.prisma.usuario.findFirst).not.toHaveBeenCalled();
    expect(email.enviarEmail).not.toHaveBeenCalled();
    expect(depois.tarefas).toHaveLength(1);
    await depois.tarefas[0]();
    expect(email.enviarEmail).toHaveBeenCalledTimes(1);
  });

  it("e-mail desconhecido: mesma resposta e nada enviado", async () => {
    db.prisma.usuario.findFirst.mockResolvedValue(null);
    const a = await (await chamar("nao@existe.com")).json();
    await depois.tarefas[0]();
    expect(email.enviarEmail).not.toHaveBeenCalled();
    db.prisma.usuario.findFirst.mockResolvedValue({ id: "u1", nome: "Ana", email: "ana@x.com" });
    const b = await (await chamar("ana@x.com")).json();
    expect(a).toEqual(b);
  });

  it("falha no envio é registrada em log e não derruba nada", async () => {
    db.prisma.usuario.findFirst.mockResolvedValue({ id: "u1", nome: "Ana", email: "ana@x.com" });
    email.enviarEmail.mockRejectedValueOnce(new Error("smtp fora"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await chamar("ana@x.com");
    await expect(depois.tarefas[0]()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
