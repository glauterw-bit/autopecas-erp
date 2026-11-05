import type { NextRequest } from "next/server";

/**
 * IP do cliente para o limite de tentativas. Usa o ÚLTIMO endereço do
 * x-forwarded-for: é o que o nosso proxy acrescenta; os da frente vêm do
 * próprio cliente e podem ser inventados para fugir do limite.
 */
export function ipDoCliente(req: Pick<NextRequest, "headers">): string {
  const partes = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return partes[partes.length - 1] ?? "local";
}
