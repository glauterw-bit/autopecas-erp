// Bootstrap rodado a cada start em produção.
// 1) Aplica schema no banco (db push) — idempotente, só altera o que mudou
// 2) Roda seed se a base está vazia (primeira execução)
//
// Logs detalhados para facilitar debug no Railway.

import { execSync } from "node:child_process";

async function main() {
  console.log("[bootstrap] Aplicando schema...");
  try {
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      stdio: "inherit",
      env: process.env,
    });
  } catch (e) {
    console.error("[bootstrap] Falha no db push:", e);
    process.exit(1);
  }

  console.log("[bootstrap] Schema aplicado. Verificando se precisa rodar seed...");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const empresas = await prisma.empresa.count();
    if (empresas === 0) {
      console.log("[bootstrap] Base vazia — rodando seed...");
      // Importa o seed dinamicamente para reaproveitar o mesmo módulo
      await import("../prisma/seed.js").catch(async () => {
        // Em produção tsx compila .ts on the fly; em dev usa .ts
        await import("../prisma/seed");
      });
    } else {
      console.log(`[bootstrap] Base já tem ${empresas} empresa(s) — pulando seed.`);
    }
  } catch (e) {
    console.error("[bootstrap] Falha verificando/rodando seed:", e);
    // Não falha o start — o seed é opcional
  } finally {
    await prisma.$disconnect();
  }

  console.log("[bootstrap] OK. Iniciando aplicação.");
}

main().catch((e) => {
  console.error("[bootstrap] ERRO:", e);
  process.exit(1);
});
