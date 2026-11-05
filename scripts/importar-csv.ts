// Importa um CSV (exportado de planilha ou do sistema antigo) para uma entidade.
// ===============================================================================
// Uso:
//   DATABASE_URL=postgresql://... npx tsx scripts/importar-csv.ts \
//     --empresa <id ou CNPJ> --entidade PRODUTO|ESTOQUE|PRECO|CLIENTE|FORNECEDOR|CONTA_RECEBER \
//     --arquivo dados.csv [--mapa mapa.json] [--deposito "Loja"] [--usuario admin@loja.com.br] \
//     [--latin1] [--aplicar]
//
// Sem --mapa, o mapa de colunas é sugerido pelo cabeçalho e impresso (salve, ajuste
// e passe com --mapa). Sem --aplicar é SIMULAÇÃO. Ordem recomendada:
// FORNECEDOR → PRODUTO → PRECO → ESTOQUE → CLIENTE → CONTA_RECEBER.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { lerCsv } from "../src/lib/implantacao/csv";
import { aplicarMapa, camposObrigatoriosFaltando, sugerirMapa } from "../src/lib/implantacao/mapa";
import { importar } from "../src/lib/implantacao/importar";
import { formatarRelatorio } from "../src/lib/implantacao/conferencia";
import { ENTIDADES, type Entidade, type Mapa } from "../src/lib/implantacao/tipos";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (n: string) => process.argv.includes(`--${n}`);

async function main() {
  const entidade = arg("entidade")?.toUpperCase() as Entidade | undefined;
  if (!entidade || !ENTIDADES.includes(entidade)) throw new Error(`--entidade deve ser uma de: ${ENTIDADES.join(", ")}`);
  const arquivo = arg("arquivo");
  if (!arquivo) throw new Error("Informe --arquivo");
  const bruto = readFileSync(arquivo);
  const texto = flag("latin1") ? new TextDecoder("windows-1252").decode(bruto) : bruto.toString("utf8");
  const csv = lerCsv(texto);
  const mapa: Mapa = arg("mapa") ? JSON.parse(readFileSync(arg("mapa")!, "utf8")) : sugerirMapa(entidade, csv.cabecalhos);
  console.log(`Colunas: ${csv.cabecalhos.join(" | ")} (separador "${csv.separador}")`);
  console.log(`Mapa: ${JSON.stringify(mapa)}`);
  const faltam = camposObrigatoriosFaltando(entidade, mapa);
  if (faltam.length) throw new Error(`Campos obrigatórios sem coluna: ${faltam.join(", ")}. Passe um --mapa.`);

  const db = new PrismaClient();
  try {
    const e = arg("empresa");
    if (!e) throw new Error("Informe --empresa <id ou CNPJ>");
    const empresa = await db.empresa.findFirst({
      where: { OR: [{ id: e }, { cnpj: e.replace(/\D/g, "") || "-" }] },
      select: { id: true, razaoSocial: true },
    });
    if (!empresa) throw new Error(`Empresa ${e} não encontrada`);
    const email = arg("usuario");
    const usuario = email
      ? await db.usuario.findFirst({ where: { email: email.toLowerCase(), empresaId: empresa.id }, select: { id: true } })
      : null;
    const r = await importar(db, {
      empresaId: empresa.id,
      usuarioId: usuario?.id,
      entidade,
      registros: aplicarMapa(entidade, csv, mapa),
      simular: !flag("aplicar"),
      origem: "CSV",
      arquivoNome: arquivo.split("/").pop(),
      depositoPadrao: arg("deposito"),
    });
    console.log("\n" + formatarRelatorio(r) + `\n(lote ${r.loteId}, ${r.duracaoMs} ms)`);
    if (r.status === "ERRO" || r.bate === false) process.exitCode = 2;
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error("Erro:", (e as Error).message);
  process.exit(1);
});
