// Bootstrap rodado a cada start em produção.
// 1) Aplica migrations versionadas (prisma migrate deploy). Em bancos criados
//    na era do `db push` (sem tabela _prisma_migrations), faz baseline
//    automático marcando 0_init como aplicada — sem tocar nos dados.
// 2) Roda seed se a base está vazia (primeira execução)
//
// Logs detalhados para facilitar debug no Railway.

import { execSync } from "node:child_process";

function migrar() {
  const run = (cmd: string) => execSync(cmd, { stdio: "pipe", env: process.env }).toString();
  try {
    console.log(run("npx prisma migrate deploy"));
    return;
  } catch (e) {
    const saida = String((e as { stdout?: Buffer; stderr?: Buffer }).stdout ?? "") +
      String((e as { stderr?: Buffer }).stderr ?? "");
    if (!saida.includes("P3005")) {
      console.error("[bootstrap] Falha no migrate deploy:", saida.slice(0, 2000));
      throw e;
    }
    // P3005 = banco tem schema mas não tem histórico de migrations (era db push)
    console.log("[bootstrap] Banco existente sem histórico — aplicando baseline 0_init...");
    console.log(run("npx prisma migrate resolve --applied 0_init"));
    console.log(run("npx prisma migrate deploy"));
  }
}

async function main() {
  console.log("[bootstrap] Aplicando migrations...");
  try {
    migrar();
  } catch (e) {
    console.error("[bootstrap] Falha ao migrar:", e);
    process.exit(1);
  }

  console.log("[bootstrap] Schema aplicado. Instalando extensões do Postgres...");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  // Extensões críticas: pg_trgm + unaccent viabilizam a busca fuzzy do PDV
  // (similarity/unaccent). pgcrypto p/ gen_random_uuid. O db push não cria
  // extensões de forma confiável, então criamos explicitamente aqui.
  for (const ext of ["pg_trgm", "unaccent", "pgcrypto"]) {
    try {
      await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS ${ext}`);
      console.log(`[bootstrap]   ✓ extensão ${ext}`);
    } catch (e) {
      console.error(`[bootstrap]   ✗ extensão ${ext}:`, (e as Error).message.split("\n")[0]);
    }
  }
  // Índices GIN trigram para acelerar a busca por nome (idempotente).
  const indices = [
    `CREATE INDEX IF NOT EXISTS idx_produtos_nome_trgm ON produtos USING gin (lower(nome) gin_trgm_ops)`,
    `CREATE INDEX IF NOT EXISTS idx_produtos_empresa_ativo ON produtos ("empresaId", ativo)`,
  ];
  for (const sql of indices) {
    try { await prisma.$executeRawUnsafe(sql); } catch { /* índice opcional */ }
  }

  console.log("[bootstrap] Verificando se precisa rodar seed...");
  let precisaPolir = false;
  try {
    const empresas = await prisma.empresa.count();
    if (empresas === 0) {
      precisaPolir = true;
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
  }

  // Polimento demo (idempotente): localização de prateleira + preço mínimo
  // para produtos sem esses dados — faz a prateleira e o MarginGuard aparecerem.
  void precisaPolir;
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE produtos SET localizacao = 'Prt ' || chr(65 + (abs(hashtext(id)) % 6)) || (1 + abs(hashtext(sku)) % 20) WHERE localizacao IS NULL OR localizacao = ''`,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE produtos SET "precoMinimo" = ROUND("custoMedio" * 1.15, 2) WHERE "precoMinimo" IS NULL AND "custoMedio" > 0`,
    );
    console.log("[bootstrap]   ✓ polimento demo aplicado");
  } catch (e) {
    console.error("[bootstrap]   ✗ polimento demo:", (e as Error).message.split("\n")[0]);
  }

  await prisma.$disconnect();
  console.log("[bootstrap] OK. Iniciando aplicação.");
}

main().catch((e) => {
  console.error("[bootstrap] ERRO:", e);
  process.exit(1);
});
