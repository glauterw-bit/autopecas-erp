import { prisma } from "../db";

// Qual empresa atende este número de WhatsApp?
// 1. MarketplaceConta ativa com plataforma WHATSAPP_CATALOG e contaExternaId = phone_number_id da Meta;
// 2. instalação de número único: WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_EMPRESA_ID no env.
// Sem vínculo, devolve null e a mensagem NÃO é processada (antes caía na primeira empresa do banco).
export async function empresaDoNumeroWhatsapp(phoneNumberId: string | null | undefined): Promise<string | null> {
  if (!phoneNumberId) return null;
  const conta = await prisma.marketplaceConta.findFirst({
    where: { plataforma: "WHATSAPP_CATALOG", contaExternaId: phoneNumberId, ativa: true },
    select: { empresaId: true },
  });
  if (conta) return conta.empresaId;
  const envId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const envEmpresa = process.env.WHATSAPP_EMPRESA_ID?.trim();
  if (envId && envEmpresa && envId === phoneNumberId) {
    const existe = await prisma.empresa.findUnique({ where: { id: envEmpresa }, select: { id: true } });
    return existe?.id ?? null;
  }
  return null;
}

/** Para log: só os 4 últimos caracteres. */
export function mascarar(v: string | null | undefined): string {
  if (!v) return "(vazio)";
  return `***${v.slice(-4)}`;
}
