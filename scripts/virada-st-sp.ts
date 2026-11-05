// Virada da ST de autopeças em SP (Portaria SRE 34/2026) pela linha de comando.
//   npx tsx scripts/virada-st-sp.ts <empresaId>                         → prévia
//   npx tsx scripts/virada-st-sp.ts <empresaId> --relatorio-estoque     → estoque 30/09/2026 (CAT 28/2020)
//   npx tsx scripts/virada-st-sp.ts <empresaId> --aplicar <usuarioId>   → aplica todos os "AJUSTAR" (com LogAuditoria)
import { aplicarViradaSt, previaViradaSt, relatorioEstoqueViradaSt } from "../src/lib/fiscal/virada-st";
import { prisma } from "../src/lib/db";

async function main() {
  const [empresaId, flag, usuarioId] = process.argv.slice(2);
  if (!empresaId) throw new Error("Informe o empresaId");
  if (flag === "--relatorio-estoque") {
    const r = await relatorioEstoqueViradaSt(empresaId);
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  const previa = await previaViradaSt(empresaId);
  console.table(previa.ajustar.map((l) => ({ sku: l.sku, de: `${l.antes.cstIcms}/${l.antes.cfopVendaInterna}`, para: `${l.depois?.cstIcms}/${l.depois?.cfopVendaInterna}`, aviso: l.aviso ?? "" })));
  console.log(`A ajustar: ${previa.ajustar.length}. Revisar à mão: ${previa.revisarManual.length}.`);
  for (const l of previa.revisarManual) console.log(`  [revisar] ${l.sku} — ${l.motivo}`);
  if (flag === "--aplicar") {
    if (!usuarioId) throw new Error("Informe o usuarioId para a auditoria");
    const r = await aplicarViradaSt({ empresaId, usuarioId, produtoIds: previa.ajustar.map((l) => l.produtoId) });
    console.log(`Aplicado: ${r.alterados} produto(s).`);
  }
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
