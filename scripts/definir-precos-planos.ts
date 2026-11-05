// Define preços e limites dos planos. Os valores NÃO estão no código: os planos
// de exemplo nascem PROVISÓRIOS e zerados (nenhuma cobrança sai com preço zero).
//
// Por env (um plano por vez, código em maiúsculas):
//   PLANO_PROFISSIONAL_PRECO_MENSAL=0 PLANO_PROFISSIONAL_PRECO_ANUAL=0 \
//   PLANO_PROFISSIONAL_PRECO_NOTA_EXCEDENTE=0 PLANO_PROFISSIONAL_PRECO_USUARIO_EXTRA=0 \
//   PLANO_PROFISSIONAL_PRECO_CNPJ_ADICIONAL=0 PLANO_PROFISSIONAL_LIMITE_NOTAS_MES=1000 \
//   npx tsx scripts/definir-precos-planos.ts
// Ou por argumentos: --plano PROFISSIONAL --mensal 0 --anual 0 --nota-excedente 0 ...
// Preencha só o que quer mudar. Ao definir qualquer preço > 0 o plano deixa de ser provisório.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const num = (v: string | undefined) => (v === undefined || v === "" || !Number.isFinite(Number(v)) || Number(v) < 0 ? undefined : Number(v));
const int = (v: string | undefined) => (num(v) === undefined ? undefined : Math.floor(Number(v)));

async function main() {
  const planos = await prisma.plano.findMany({ where: { codigo: { not: "INTERNO" } } });
  const alvo = arg("plano")?.toUpperCase();
  for (const p of planos) {
    if (alvo && p.codigo !== alvo) continue;
    const e = (s: string) => process.env[`PLANO_${p.codigo}_${s}`];
    const v = (flag: string, env: string) => (alvo ? arg(flag) ?? e(env) : e(env));
    const dados = {
      precoMensal: num(v("mensal", "PRECO_MENSAL")),
      precoAnual: num(v("anual", "PRECO_ANUAL")),
      precoNotaExcedente: num(v("nota-excedente", "PRECO_NOTA_EXCEDENTE")),
      precoUsuarioExtra: num(v("usuario-extra", "PRECO_USUARIO_EXTRA")),
      precoCnpjAdicional: num(v("cnpj-adicional", "PRECO_CNPJ_ADICIONAL")),
      limiteUsuarios: int(v("usuarios", "LIMITE_USUARIOS")),
      limiteNotasMes: int(v("notas", "LIMITE_NOTAS_MES")),
      limiteProdutos: int(v("produtos", "LIMITE_PRODUTOS")),
      limiteDepositos: int(v("depositos", "LIMITE_DEPOSITOS")),
    };
    const mudancas = Object.fromEntries(Object.entries(dados).filter(([, x]) => x !== undefined));
    if (Object.keys(mudancas).length === 0) continue;
    const definiuPreco = ["precoMensal", "precoAnual"].some((k) => Number((mudancas as Record<string, number>)[k] ?? 0) > 0);
    await prisma.plano.update({ where: { id: p.id }, data: { ...mudancas, ...(definiuPreco ? { provisorio: false } : {}) } });
    console.log(`✓ ${p.codigo}:`, mudancas);
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
