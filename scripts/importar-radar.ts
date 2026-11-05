// Importa cadastro, preço, estoque e clientes do espelho do Radar (tabelas erp_*).
// =================================================================================
// Uso:
//   RADAR_DATABASE_URL=postgresql://... DATABASE_URL=postgresql://... \
//   npx tsx scripts/importar-radar.ts --empresa <id ou CNPJ> [--aplicar] \
//     [--usuario admin@loja.com.br] [--entidades fornecedores,produtos,estoque,clientes] \
//     [--filial-preco 1] [--almoxarifados 1,3] [--pagina 1000] [--limite 100]
//
// Sem --aplicar é SIMULAÇÃO: lê tudo, mostra o plano e o relatório, não grava dados.
// A origem é lida SOMENTE em modo leitura (transação READ ONLY, statement_timeout,
// páginas por chave). Origem fora desta máquina exige --origem-remota-ok, para
// ninguém apontar sem querer para o banco de produção do Radar.
import { PrismaClient } from "@prisma/client";
import { importarDoRadar, ENTIDADES_RADAR, type EntidadeRadar } from "../src/lib/implantacao/radar-importar";
import { formatarRelatorio } from "../src/lib/implantacao/conferencia";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (n: string) => process.argv.includes(`--${n}`);
const lista = (s?: string) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined);

async function main() {
  const url = process.env.RADAR_DATABASE_URL;
  if (!url) throw new Error("Defina RADAR_DATABASE_URL (banco de origem, só leitura)");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && !flag("origem-remota-ok"))
    throw new Error(`Origem em ${host} não é local. Confirme com --origem-remota-ok (e combine o horário com o dono).`);

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
    if (email && !usuario) throw new Error(`Usuário ${email} não é desta empresa`);

    const entidades = lista(arg("entidades")) as EntidadeRadar[] | undefined;
    for (const x of entidades ?? []) if (!ENTIDADES_RADAR.includes(x)) throw new Error(`Entidade inválida: ${x}`);
    const simular = !flag("aplicar");
    console.log(`Empresa: ${empresa.razaoSocial} | origem: ${host} | ${simular ? "SIMULAÇÃO" : "APLICANDO"}\n`);

    const r = await importarDoRadar(db, {
      empresaId: empresa.id,
      usuarioId: usuario?.id,
      simular,
      entidades,
      radar: {
        url,
        filialPreco: arg("filial-preco") ? Number(arg("filial-preco")) : undefined,
        almoxarifados: lista(arg("almoxarifados"))?.map(Number),
        pagina: arg("pagina") ? Number(arg("pagina")) : undefined,
        limite: arg("limite") ? Number(arg("limite")) : undefined,
      },
    });
    console.log(`Tabelas na origem: ${Object.entries(r.tabelas).map(([t, ok]) => `${t}${ok ? "" : " (ausente)"}`).join(", ")}`);
    console.log(`Consultas de leitura feitas na origem: ${r.consultasOrigem}\n`);
    for (const res of r.resultados) console.log(formatarRelatorio(res) + `\n(lote ${res.loteId}, ${res.duracaoMs} ms)\n`);
    if (r.resultados.some((x) => x.status === "ERRO" || x.bate === false)) process.exitCode = 2;
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error("Erro:", (e as Error).message);
  process.exit(1);
});
