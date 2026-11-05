import { describe, expect, it } from "vitest";
import { ipDoCliente } from "./ip";

const req = (xff?: string) => ({ headers: new Headers(xff ? { "x-forwarded-for": xff } : {}) });

describe("ipDoCliente", () => {
  it("usa o último IP (o do proxy), ignorando os que o cliente inventou", () => {
    expect(ipDoCliente(req("1.1.1.1, 2.2.2.2, 203.0.113.9"))).toBe("203.0.113.9");
    expect(ipDoCliente(req("203.0.113.9"))).toBe("203.0.113.9");
    expect(ipDoCliente(req(" 6.6.6.6 ,  203.0.113.9 "))).toBe("203.0.113.9");
  });
  it("sem cabeçalho: local", () => {
    expect(ipDoCliente(req())).toBe("local");
    expect(ipDoCliente(req(" , "))).toBe("local");
  });
});
