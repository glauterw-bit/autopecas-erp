import { cookies } from "next/headers";
import { prisma } from "../db";

// Sessão do portal B2B
// ====================
// Clientes (mecânicos, frotistas, revendas) logam separadamente do ERP
// interno. Não compartilham auth com os usuários da loja — fica seguro
// porque cada cliente só vê os próprios dados.

const COOKIE = "ap_b2b_cliente";

export async function clienteAtualB2B() {
  const c = await cookies();
  const id = c.get(COOKIE)?.value;
  if (!id) return null;
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      tabelaPreco: true,
      veiculos: { include: { versao: { include: { modelo: { include: { montadora: true } } } } } },
    },
  });
  if (!cliente || cliente.bloqueado) return null;
  return cliente;
}

export async function loginB2B(cpfCnpj: string, senha: string) {
  // Em produção: bcrypt hash. Aqui usamos o último dígito do CPF como senha
  // demo para acelerar testes. NÃO USAR ASSIM EM PROD.
  const cliente = await prisma.cliente.findFirst({
    where: { cpfCnpj: cpfCnpj.replace(/\D/g, "") },
  });
  if (!cliente) return null;
  if (cliente.bloqueado) throw new Error("Cliente bloqueado");
  // placeholder: senha = últimos 4 dígitos do CPF/CNPJ
  const esperada = cliente.cpfCnpj?.slice(-4);
  if (senha !== esperada) return null;

  const c = await cookies();
  c.set(COOKIE, cliente.id, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 3600,
    path: "/b2b",
  });
  return cliente;
}

export async function logoutB2B() {
  const c = await cookies();
  c.delete(COOKIE);
}
