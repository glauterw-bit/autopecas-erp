import crypto from "node:crypto";

// Token de uso único (convite e redefinição de senha).
// O token vai só no link; no banco fica o hash SHA-256.
export const VALIDADE_REDEFINICAO_MS = 30 * 60 * 1000;
export const VALIDADE_CONVITE_MS = 72 * 3600 * 1000;

export function gerarToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export type TipoToken = "CONVITE" | "REDEFINICAO_SENHA";

export function validadeMs(tipo: TipoToken): number {
  return tipo === "CONVITE" ? VALIDADE_CONVITE_MS : VALIDADE_REDEFINICAO_MS;
}

/** Senha nova: mínimo 10 caracteres, com letra e número. */
export function validarSenhaNova(senha: string): string | null {
  if (senha.length < 10) return "A senha precisa ter pelo menos 10 caracteres.";
  if (senha.length > 200) return "A senha é longa demais.";
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return "Use letras e números na senha.";
  return null;
}

/** Não deixa a empresa ficar sem ADMIN ativo. */
export function deixariaSemAdmin(opts: {
  adminsAtivosOutros: number;
  alvoEraAdminAtivo: boolean;
  alvoContinuaAdminAtivo: boolean;
}): boolean {
  if (!opts.alvoEraAdminAtivo || opts.alvoContinuaAdminAtivo) return false;
  return opts.adminsAtivosOutros < 1;
}

/** Usuário convidado que ainda não definiu senha (hash que nunca confere). */
export const SENHA_PENDENTE = "!pendente";
