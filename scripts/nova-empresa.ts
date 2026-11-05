// Onboarding de um novo cliente (tenant) do ERP.
// ================================================
// Uso (local ou via Railway):
//   npx tsx scripts/nova-empresa.ts \
//     --razao "AutoPeças Silva LTDA" --cnpj 11222333000144 --uf SP \
//     --admin-nome "João Silva" --admin-email joao@silva.com.br \
//     [--admin-senha "SenhaForte123"] [--regime SIMPLES_NACIONAL] [--fantasia "Silva Peças"]
//
// Em produção: railway run npx tsx scripts/nova-empresa.ts -- --razao ...
//
// Cria: Empresa + Filial "Matriz" + Depósito "Loja" + usuário ADMIN + assinatura
// (INTERNO ativa; ou período de teste com --trial). Lógica em src/lib/empresas/criar-empresa.ts.
// Se a senha for omitida, gera uma aleatória e imprime UMA vez.

import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { criarEmpresaComAdmin, ErroCadastro } from "../src/lib/empresas/criar-empresa";

const prisma = new PrismaClient();

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const razao = arg("razao");
  const cnpj = arg("cnpj")?.toUpperCase().replace(/[^0-9A-Z]/g, "");
  const adminNome = arg("admin-nome");
  const adminEmail = arg("admin-email")?.toLowerCase();
  if (!razao || !cnpj || !adminNome || !adminEmail) {
    console.error(
      "Uso: --razao <razão social> --cnpj <cnpj> --admin-nome <nome> --admin-email <email> [--admin-senha ...] [--uf SP] [--regime SIMPLES_NACIONAL] [--fantasia ...]",
    );
    process.exit(1);
  }
  if (cnpj.length !== 14) {
    console.error(`CNPJ inválido: "${cnpj}" (precisa de 14 dígitos)`);
    process.exit(1);
  }
  const regime = (arg("regime") ?? "SIMPLES_NACIONAL") as
    | "SIMPLES_NACIONAL"
    | "LUCRO_PRESUMIDO"
    | "LUCRO_REAL";
  const senha = arg("admin-senha") ?? crypto.randomBytes(9).toString("base64url");

  const jaExiste = await prisma.empresa.findUnique({ where: { cnpj } });
  if (jaExiste) {
    console.error(`Já existe empresa com CNPJ ${cnpj}: ${jaExiste.razaoSocial}`);
    process.exit(1);
  }
  const emailEmUso = await prisma.usuario.findUnique({ where: { email: adminEmail } });
  if (emailEmUso) {
    console.error(`E-mail ${adminEmail} já está em uso por outro usuário.`);
    process.exit(1);
  }

  // Loja implantada à mão: assinatura ATIVA no plano INTERNO (sem limite).
  // Com --trial, nasce em período de teste como no cadastro self-service.
  let empresa;
  try {
    ({ empresa } = await criarEmpresaComAdmin(prisma, {
      razaoSocial: razao,
      nomeFantasia: arg("fantasia") ?? razao,
      cnpj,
      uf: arg("uf") ?? null,
      regimeTributario: regime,
      adminNome,
      adminEmail,
      adminSenha: senha,
      assinatura: { tipo: process.argv.includes("--trial") ? "TRIAL" : "INTERNO" },
    }));
  } catch (e) {
    if (e instanceof ErroCadastro) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }

  console.log("========================================");
  console.log("✓ Empresa criada:", empresa.razaoSocial, `(${empresa.id})`);
  console.log("✓ Filial Matriz + Depósito Loja");
  console.log("✓ Admin:", adminEmail);
  console.log("  Senha:", senha, arg("admin-senha") ? "" : "(gerada — anote AGORA, não será exibida de novo)");
  console.log("========================================");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
