import { createHash, timingSafeEqual } from "node:crypto";

// Compara o token em tempo constante (hash dos dois lados iguala o tamanho).
export function tokenConfere(recebido: string | null | undefined, esperado: string | undefined): boolean {
  if (!esperado || !recebido) return false;
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}
