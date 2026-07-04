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
// Cria: Empresa + Filial "Matriz" + Depósito "Loja" + usuário ADMIN.
// Se a senha for omitida, gera uma aleatória e imprime UMA vez.

import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hashSenha(senha: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(senha, salt, 100_000, 64, "sha512").toString("hex");
  return `pbkdf2$100000$${salt}$${hash}`;
}

async function main() {
  const razao = arg("razao");
  const cnpj = arg("cnpj")?.replace(/\D/g, "");
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

  const empresa = await prisma.empresa.create({
    data: {
      razaoSocial: razao,
      nomeFantasia: arg("fantasia") ?? razao,
      cnpj,
      uf: arg("uf") ?? null,
      regimeTributario: regime,
      filiais: { create: [{ nome: "Matriz" }] },
      usuarios: {
        create: [
          {
            nome: adminNome,
            email: adminEmail,
            senhaHash: hashSenha(senha),
            perfil: "ADMIN",
          },
        ],
      },
    },
    include: { filiais: true },
  });
  await prisma.deposito.create({
    data: {
      empresaId: empresa.id,
      filialId: empresa.filiais[0].id,
      nome: "Loja",
      tipo: "LOJA",
    },
  });

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
