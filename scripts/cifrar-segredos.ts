// Cifra os segredos que ainda estão em texto aberto no banco.
// ===========================================================
// Uso:
//   npx tsx scripts/cifrar-segredos.ts            → SIMULAÇÃO (só conta, não grava)
//   npx tsx scripts/cifrar-segredos.ts --aplicar  → grava
//   ... --recifrar  → também recifra o que foi cifrado com APP_ENCRYPTION_KEY_ANTERIOR
// Em produção: railway run npx tsx scripts/cifrar-segredos.ts -- --aplicar
//
// O que cobre:
//   - MarketplaceConta.accessToken e refreshToken;
//   - Empresa.configuracoes.fiscal.focus.tokenHomologacao / tokenProducao;
//   - Empresa.configuracoes.fiscal.nfce.cscHomologacao / cscProducao.
// Precisa de APP_ENCRYPTION_KEY. Nunca imprime segredo: só contagens e ids.
// Pode rodar quantas vezes quiser (o que já está cifrado é pulado).

import { PrismaClient } from "@prisma/client";
import { cifrar, decifrar, estaCifrado } from "../src/lib/cripto";

const prisma = new PrismaClient();
const APLICAR = process.argv.includes("--aplicar");
const RECIFRAR = process.argv.includes("--recifrar");

/** Devolve o novo valor, ou null se não precisa mexer. */
function novoValor(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  if (!estaCifrado(v)) return cifrar(v);
  if (!RECIFRAR) return null;
  try {
    decifrar(v, { APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY });
    return null; // já está na chave atual
  } catch {
    return cifrar(decifrar(v)); // decifra com a anterior e cifra com a atual
  }
}

async function contasMarketplace() {
  const contas = await prisma.marketplaceConta.findMany({
    select: { id: true, accessToken: true, refreshToken: true },
  });
  let alteradas = 0;
  for (const c of contas) {
    const a = novoValor(c.accessToken);
    const r = novoValor(c.refreshToken);
    if (!a && !r) continue;
    alteradas++;
    if (!APLICAR) continue;
    // Só grava se ninguém trocou o token no meio (renovação concorrente).
    await prisma.marketplaceConta.updateMany({
      where: { id: c.id, accessToken: c.accessToken, refreshToken: c.refreshToken },
      data: { ...(a ? { accessToken: a } : {}), ...(r ? { refreshToken: r } : {}) },
    });
  }
  return { total: contas.length, alteradas };
}

async function empresas() {
  const lista = await prisma.empresa.findMany({ select: { id: true, configuracoes: true } });
  let alteradas = 0;
  for (const e of lista) {
    const cfg = (e.configuracoes ?? {}) as Record<string, unknown>;
    const fiscal = cfg.fiscal && typeof cfg.fiscal === "object" ? { ...(cfg.fiscal as Record<string, unknown>) } : null;
    if (!fiscal) continue;
    let mudou = false;
    for (const [grupo, campos] of [
      ["focus", ["tokenHomologacao", "tokenProducao"]],
      ["nfce", ["cscHomologacao", "cscProducao"]],
    ] as const) {
      const g = fiscal[grupo];
      if (!g || typeof g !== "object") continue;
      const novo = { ...(g as Record<string, unknown>) };
      for (const campo of campos) {
        const v = novoValor(novo[campo]);
        if (v) {
          novo[campo] = v;
          mudou = true;
        }
      }
      fiscal[grupo] = novo;
    }
    if (!mudou) continue;
    alteradas++;
    if (!APLICAR) continue;
    await prisma.$executeRaw`UPDATE "empresas"
      SET "configuracoes" = jsonb_set(COALESCE("configuracoes", '{}'::jsonb), '{fiscal}', ${JSON.stringify(fiscal)}::jsonb, true)
      WHERE "id" = ${e.id}`;
  }
  return { total: lista.length, alteradas };
}

async function main() {
  if (!process.env.APP_ENCRYPTION_KEY) {
    console.error("[cifrar-segredos] falta APP_ENCRYPTION_KEY (gere com: openssl rand -base64 32).");
    process.exit(1);
  }
  console.log(`[cifrar-segredos] modo: ${APLICAR ? "APLICAR (grava)" : "SIMULAÇÃO (não grava)"}${RECIFRAR ? " + recifrar" : ""}`);
  const m = await contasMarketplace();
  console.log(`[cifrar-segredos] contas de marketplace: ${m.alteradas} de ${m.total} ${APLICAR ? "cifradas" : "seriam cifradas"}`);
  const f = await empresas();
  console.log(`[cifrar-segredos] empresas (token Focus / CSC): ${f.alteradas} de ${f.total} ${APLICAR ? "cifradas" : "seriam cifradas"}`);
  if (!APLICAR) console.log("[cifrar-segredos] nada foi gravado. Rode de novo com --aplicar.");
}

main()
  .catch((e) => {
    console.error("[cifrar-segredos] erro:", (e as Error).message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
