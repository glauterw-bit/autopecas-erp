// Mostra o id de um usuário pelo e-mail, para pôr em SAAS_ADMIN_USER_IDS.
// Só leitura. Uso: npx tsx scripts/meu-id-saas.ts seu@email.com
import { PrismaClient } from "@prisma/client";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Uso: npx tsx scripts/meu-id-saas.ts seu@email.com");
    process.exit(1);
  }
  const db = new PrismaClient();
  try {
    const u = await db.usuario.findUnique({ where: { email }, select: { id: true, nome: true, ativo: true, totpSecret: true } });
    if (!u) {
      console.error("Nenhum usuário com esse e-mail.");
      process.exit(1);
    }
    console.log(`id: ${u.id}`);
    console.log(`ativo: ${u.ativo ? "sim" : "não"} | 2FA: ${u.totpSecret ? "ligado" : "DESLIGADO (ligue antes, senão o painel não abre)"}`);
    console.log(`Coloque SAAS_ADMIN_USER_IDS=${u.id} nas variáveis do Railway.`);
  } finally {
    await db.$disconnect();
  }
}
main();
