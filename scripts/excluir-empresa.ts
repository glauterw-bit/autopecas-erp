// Exclusão dos dados de uma empresa depois do cancelamento (90 dias).
// Uso do dono do SaaS. NÃO roda sozinho em lugar nenhum.
//
//   Simulação (padrão, não apaga nada, mostra as contagens):
//     npx tsx scripts/excluir-empresa.ts --cnpj 11222333000144
//
//   Para valer:
//     npx tsx scripts/excluir-empresa.ts --cnpj 11222333000144 \
//       --cancelada-em 2026-08-01 --executar
//   O script pede para digitar o CNPJ de novo. Recusa se o cancelamento
//   tiver menos de 90 dias.
//
// O que apaga e o que fica: veja o cabeçalho de src/lib/lgpd/excluir-empresa.ts
// e docs/LGPD-EXCLUSAO-DE-EMPRESA.md. Antes de rodar para valer, confirme que a
// loja já recebeu a exportação dos dados (Configurações → Meus dados).
// Faça backup do banco antes. Aponta para o banco pela DATABASE_URL.

import readline from "node:readline/promises";
import { PrismaClient } from "@prisma/client";
import { excluirDadosDaEmpresa } from "../src/lib/lgpd/excluir-empresa";

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const DIAS_CARENCIA = 90;

async function main() {
  const cnpj = arg("cnpj")?.replace(/\D/g, "");
  const executar = process.argv.includes("--executar");
  if (!cnpj || cnpj.length !== 14) {
    console.error("Uso: --cnpj <14 dígitos> [--cancelada-em AAAA-MM-DD --executar]");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const empresa = await prisma.empresa.findUnique({ where: { cnpj }, select: { id: true, razaoSocial: true } });
    if (!empresa) {
      console.error("Nenhuma empresa com esse CNPJ neste banco.");
      process.exit(1);
    }
    const host = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").replace(/\?.*$/, "");
    console.log(`Empresa: ${empresa.razaoSocial}\nBanco: ${host || "(DATABASE_URL vazia)"}`);

    if (executar) {
      const data = arg("cancelada-em");
      const cancelada = data ? new Date(`${data}T00:00:00Z`) : null;
      if (!cancelada || Number.isNaN(cancelada.getTime())) {
        console.error("Para executar, informe --cancelada-em AAAA-MM-DD (data do cancelamento).");
        process.exit(1);
      }
      const dias = Math.floor((Date.now() - cancelada.getTime()) / 86_400_000);
      if (dias < DIAS_CARENCIA) {
        console.error(`Só ${dias} dia(s) desde o cancelamento. O prazo é de ${DIAS_CARENCIA} dias. Nada foi apagado.`);
        process.exit(1);
      }
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const digitado = (await rl.question(`Digite o CNPJ (${cnpj}) para confirmar a exclusão: `)).replace(/\D/g, "");
      rl.close();
      if (digitado !== cnpj) {
        console.error("CNPJ diferente. Nada foi apagado.");
        process.exit(1);
      }
    }

    const r = await excluirDadosDaEmpresa(prisma, empresa.id, { simular: !executar });
    console.log(r.simulacao ? "\nSIMULAÇÃO (nada foi apagado). Linhas que seriam apagadas:" : "\nApagado:");
    for (const [k, v] of Object.entries(r.apagados)) console.log(`  ${k}: ${v}`);
    console.log("Fica guardado por obrigação legal:");
    for (const [k, v] of Object.entries(r.mantidos)) console.log(`  ${k}: ${v}`);
    if (r.simulacao) console.log("\nPara apagar de verdade, rode de novo com --cancelada-em e --executar.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Falhou, nada foi apagado:", (e as Error).message);
  process.exit(1);
});
