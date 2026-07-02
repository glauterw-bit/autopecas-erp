// Rate limiting simples em memória (janela deslizante).
// Suficiente para instância única no Railway; se escalar horizontalmente,
// trocar por Redis (INCR + EXPIRE) usando a mesma interface.

const janelas = new Map<string, number[]>();

export function permitido(chave: string, limite: number, janelaMs: number): boolean {
  const agora = Date.now();
  const hits = (janelas.get(chave) ?? []).filter((t) => agora - t < janelaMs);
  if (hits.length >= limite) {
    janelas.set(chave, hits);
    return false;
  }
  hits.push(agora);
  janelas.set(chave, hits);
  // Limpeza oportunista pra não crescer sem limite
  if (janelas.size > 10_000) {
    for (const [k, v] of janelas) {
      if (v.every((t) => agora - t >= janelaMs)) janelas.delete(k);
    }
  }
  return true;
}
