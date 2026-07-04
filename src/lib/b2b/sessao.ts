import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "../db";
import { verificarSenha } from "../auth/config";

// Sessão do portal B2B
// ====================
// Clientes (mecânicas, frotistas, revendas) logam separadamente do ERP.
// O cookie é ASSINADO (HMAC-SHA256) — o valor `id.exp` sozinho não vale nada
// sem a assinatura, então não dá pra forjar sessão trocando o id.
// O acesso só existe se um gestor ativou o B2B do cliente e definiu senha.

const COOKIE = "ap_b2b_cliente";
const TTL_S = 7 * 24 * 3600;

function segredo(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET não configurado (mínimo 32 caracteres)");
  }
  return "dev-secret-nao-usar-em-producao-0000";
}

function assinar(payload: string): string {
  return crypto.createHmac("sha256", segredo()).update(payload).digest("base64url");
}

export function selarSessaoB2B(clienteId: string): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_S;
  const payload = `${clienteId}.${exp}`;
  return `${payload}.${assinar(payload)}`;
}

export function abrirSessaoB2B(valor: string | undefined): string | null {
  if (!valor) return null;
  const partes = valor.split(".");
  if (partes.length !== 3) return null;
  const [id, expStr, sig] = partes;
  const payload = `${id}.${expStr}`;
  const esperada = assinar(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(expStr) < Math.floor(Date.now() / 1000)) return null;
  return id;
}

export async function clienteAtualB2B() {
  const c = await cookies();
  const id = abrirSessaoB2B(c.get(COOKIE)?.value);
  if (!id) return null;
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      tabelaPreco: true,
      veiculos: { include: { versao: { include: { modelo: { include: { montadora: true } } } } } },
    },
  });
  if (!cliente || cliente.bloqueado || !cliente.b2bAtivo) return null;
  return cliente;
}

export async function loginB2B(cpfCnpj: string, senha: string) {
  // O mesmo CPF/CNPJ pode ser cliente de mais de uma loja (unique é por
  // empresa) — a senha decide EM QUAL cadastro logar, nunca o "primeiro".
  const candidatos = await prisma.cliente.findMany({
    where: { cpfCnpj: cpfCnpj.replace(/\D/g, "") },
  });
  if (candidatos.length === 0) return null;

  const habilitados = candidatos.filter((c) => c.b2bAtivo && c.senhaHashB2B);
  if (habilitados.length === 0) {
    throw new Error("Acesso B2B não habilitado. Fale com a loja.");
  }

  const casaram = habilitados.filter((c) => verificarSenha(senha, c.senhaHashB2B!));
  if (casaram.length === 0) return null;
  if (casaram.length > 1) {
    throw new Error("Documento associado a mais de uma loja — contate o suporte");
  }

  const cliente = casaram[0];
  if (cliente.bloqueado) throw new Error("Cliente bloqueado");

  const c = await cookies();
  c.set(COOKIE, selarSessaoB2B(cliente.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: TTL_S,
    path: "/",
  });
  return cliente;
}

export async function logoutB2B() {
  const c = await cookies();
  c.delete(COOKIE);
}
