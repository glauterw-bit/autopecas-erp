import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "../db";

// Sistema de autenticação simples mas seguro (sem dependência externa)
// =====================================================================
// - Senha: PBKDF2 (Node built-in, sem precisar de bcrypt nativo no Railway)
// - TOTP: RFC 6238 (Google Authenticator / 1Password compatível)
// - Sessão: token aleatório 256 bits em cookie httpOnly+Secure
// - RBAC: ADMIN > GERENTE > VENDEDOR/CAIXA > ESTOQUISTA/FINANCEIRO/TECNICO

const COOKIE = "ap_auth";
const ITERATIONS = 100_000;
const KEY_LEN = 64;

// --- Senha (PBKDF2) -----------------------------------------------------
export function hashSenha(senha: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(senha, salt, ITERATIONS, KEY_LEN, "sha512")
    .toString("hex");
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`;
}

export function verificarSenha(senha: string, armazenado: string): boolean {
  if (!armazenado.startsWith("pbkdf2$")) return false;
  const [, iter, salt, hash] = armazenado.split("$");
  const recalc = crypto
    .pbkdf2Sync(senha, salt, Number(iter), hash.length / 2, "sha512")
    .toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(recalc, "hex"));
}

// --- TOTP (RFC 6238) ----------------------------------------------------
export function gerarTotpSecret(): string {
  // 20 bytes base32 (formato compatível com Google Authenticator)
  const bytes = crypto.randomBytes(20);
  return base32encode(bytes);
}

export function verificarTotp(secret: string, codigo: string): boolean {
  if (!/^\d{6}$/.test(codigo)) return false;
  const now = Math.floor(Date.now() / 1000 / 30);
  for (const delta of [-1, 0, 1]) {
    if (totp(secret, now + delta) === codigo) return true;
  }
  return false;
}

function totp(secret: string, counter: number): string {
  const key = base32decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

export function urlOtpAuth(usuario: string, secret: string, issuer = "AutoPeças ERP") {
  const label = encodeURIComponent(`${issuer}:${usuario}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32encode(b: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of b) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32decode(s: string): Buffer {
  s = s.toUpperCase().replace(/=+$/, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of s) {
    const idx = B32.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// --- Sessão -------------------------------------------------------------
export async function criarSessao(usuarioId: string, ip?: string, userAgent?: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expira = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  await prisma.sessaoAuth.create({
    data: { usuarioId, token, ip, userAgent, expiraEm: expira },
  });
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { ultimoLogin: new Date() },
  });
  const c = await cookies();
  c.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 3600,
    path: "/",
  });
  return token;
}

export async function destruirSessao() {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (token) {
    await prisma.sessaoAuth.deleteMany({ where: { token } });
  }
  c.delete(COOKIE);
}

export async function usuarioDaSessao() {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (!token) return null;
  const sess = await prisma.sessaoAuth.findUnique({ where: { token } });
  if (!sess || sess.expiraEm < new Date()) {
    if (sess) await prisma.sessaoAuth.delete({ where: { id: sess.id } }).catch(() => undefined);
    return null;
  }
  return prisma.usuario.findUnique({
    where: { id: sess.usuarioId },
    select: {
      id: true, nome: true, email: true, perfil: true, ativo: true,
      empresaId: true, permissoes: true,
    },
  });
}

// --- RBAC ---------------------------------------------------------------
const HIERARQUIA: Record<string, number> = {
  ADMIN: 100,
  GERENTE: 80,
  FINANCEIRO: 60,
  VENDEDOR: 50,
  CAIXA: 50,
  TECNICO: 40,
  ESTOQUISTA: 30,
};

export function podePerfil(atual: string, necessario: string): boolean {
  return (HIERARQUIA[atual] ?? 0) >= (HIERARQUIA[necessario] ?? 100);
}

export async function exigirPerfil(necessario: string) {
  const u = await usuarioDaSessao();
  if (!u) throw new Error("Não autenticado");
  if (!podePerfil(u.perfil, necessario)) throw new Error("Sem permissão");
  return u;
}
