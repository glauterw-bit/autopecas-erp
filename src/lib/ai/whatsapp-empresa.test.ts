import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ conta: vi.fn(), empresa: vi.fn() }));
vi.mock("../db", () => ({
  prisma: {
    marketplaceConta: { findFirst: m.conta },
    empresa: { findUnique: m.empresa },
  },
}));

import { empresaDoNumeroWhatsapp, mascarar } from "./whatsapp-empresa";

const contas = [
  { empresaId: "A", plataforma: "WHATSAPP_CATALOG", contaExternaId: "111", ativa: true },
  { empresaId: "B", plataforma: "WHATSAPP_CATALOG", contaExternaId: "222", ativa: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_EMPRESA_ID;
  m.conta.mockImplementation(async ({ where }) => {
    const c = contas.find(
      (x) => x.plataforma === where.plataforma && x.contaExternaId === where.contaExternaId && x.ativa === where.ativa,
    );
    return c ? { empresaId: c.empresaId } : null;
  });
  m.empresa.mockImplementation(async ({ where }) => (["A", "B"].includes(where.id) ? { id: where.id } : null));
});

describe("WhatsApp: mensagem vai para a empresa dona do número", () => {
  it("número da empresa B cai na empresa B (e não na primeira do banco)", async () => {
    expect(await empresaDoNumeroWhatsapp("222")).toBe("B");
    expect(await empresaDoNumeroWhatsapp("111")).toBe("A");
  });
  it("número sem vínculo não é processado", async () => {
    expect(await empresaDoNumeroWhatsapp("999")).toBeNull();
    expect(await empresaDoNumeroWhatsapp(undefined)).toBeNull();
  });
  it("instalação de número único pelo env, só se o número bater", async () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = "333";
    process.env.WHATSAPP_EMPRESA_ID = "B";
    expect(await empresaDoNumeroWhatsapp("333")).toBe("B");
    expect(await empresaDoNumeroWhatsapp("444")).toBeNull();
  });
  it("log mascara o identificador", () => {
    expect(mascarar("5511999998888")).toBe("***8888");
  });
});
