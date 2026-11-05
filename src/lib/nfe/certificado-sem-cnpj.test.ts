import { describe, expect, it, vi } from "vitest";

vi.mock("./certificado-a1", () => ({
  ErroCertificado: class extends Error {},
  lerCertificadoA1: () => ({ validoAte: new Date("2030-01-01"), validoDe: new Date("2026-01-01"), titular: "X", cnpj: null, emissor: "Y" }),
}));
vi.mock("../db", () => ({
  prisma: { empresa: { findUniqueOrThrow: async () => ({ cnpj: "12345678000195" }) } },
}));

describe("certificado sem CNPJ legível", () => {
  it("é recusado com mensagem clara", async () => {
    const { receberCertificado } = await import("./config-fiscal-servico");
    await expect(
      receberCertificado("e1", "u1", { arquivo: Buffer.from("x"), senha: "s", enviarParaFocus: false }),
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining("Não foi possível ler o CNPJ do certificado") });
  });
});
