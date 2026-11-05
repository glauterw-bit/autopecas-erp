import { cifrarSeTexto, decifrarOpcional, ErroCripto } from "../cripto";

// Tokens de marketplace em repouso (MarketplaceConta.accessToken/refreshToken)
// ==========================================================================
// Ponto único de leitura e gravação: grava cifrado (AES-256-GCM, src/lib/cripto.ts)
// e lê aceitando o legado em texto aberto (scripts/cifrar-segredos.ts migra).

/** Decifra o token gravado. Nulo/vazio → null. Ilegível → erro pedindo reconexão. */
export function lerTokenConta(valor: string | null | undefined): string | null {
  try {
    return decifrarOpcional(valor);
  } catch (e) {
    if (e instanceof ErroCripto) {
      throw new Error("Token da conta do marketplace ilegível (chave do servidor mudou): reconecte a conta");
    }
    throw e;
  }
}

/** Cifra accessToken/refreshToken presentes antes de gravar; o resto passa igual. */
export function tokensParaGravar<T extends { accessToken?: string | null; refreshToken?: string | null }>(dados: T): T {
  const out = { ...dados };
  if ("accessToken" in out) out.accessToken = cifrarSeTexto(out.accessToken);
  if ("refreshToken" in out) out.refreshToken = cifrarSeTexto(out.refreshToken);
  return out;
}
