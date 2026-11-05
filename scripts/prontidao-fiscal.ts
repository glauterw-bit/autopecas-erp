// Lista cada empresa e o que falta no checklist fiscal (Configurações > Fiscal).
// SÓ LEITURA: não grava nada e não imprime token, CSC nem senha.
// Uso (antes de publicar): npx tsx scripts/prontidao-fiscal.ts
// Saída com código 1 se alguma empresa tiver pendência que bloqueia a emissão.
import { PrismaClient } from "@prisma/client";
import { checklistFiscal, pendenciasBloqueantes } from "../src/lib/nfe/prontidao-fiscal";

const mascarar = (cnpj: string) => {
  const d = cnpj.replace(/\D/g, "");
  return d.length === 14 ? `${d.slice(0, 2)}.***.***/****-${d.slice(12)}` : "***";
};

async function main() {
  const db = new PrismaClient();
  try {
    const empresas = await db.empresa.findMany({
      select: { id: true, razaoSocial: true, cnpj: true, inscEstadual: true, regimeTributario: true, logradouro: true, numero: true, bairro: true, municipio: true, uf: true, cep: true, configuracoes: true },
      orderBy: { razaoSocial: "asc" },
    });
    let comPendencia = 0;
    for (const e of empresas) {
      // NF-e (55) e NFC-e (65) juntas: junta as pendências sem repetir.
      const vistos = new Set<string>();
      const faltas: string[] = [];
      for (const modelo of ["55", "65"] as const) {
        for (const i of pendenciasBloqueantes(checklistFiscal(e, { modelo }))) {
          if (!vistos.has(i.id)) {
            vistos.add(i.id);
            faltas.push(i.detalhe);
          }
        }
      }
      const avisos = checklistFiscal(e).filter((i) => i.aviso).map((i) => i.aviso!);
      console.log(`\n${e.razaoSocial} (${mascarar(e.cnpj)}): ${faltas.length ? `FALTA ${faltas.length} item(ns)` : "pronta"}`);
      faltas.forEach((f) => console.log(`  - ${f}`));
      avisos.forEach((a) => console.log(`  ! aviso: ${a}`));
      if (faltas.length) comPendencia++;
    }
    console.log(`\n${empresas.length} empresa(s); ${comPendencia} com pendência que bloqueia a emissão.`);
    process.exitCode = comPendencia ? 1 : 0;
  } finally {
    await db.$disconnect();
  }
}
main();
