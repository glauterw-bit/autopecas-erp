import { Prisma, type PrismaClient } from "@prisma/client";
import { hashSenha } from "../auth/config";

// Criação de empresa (tenant) com filial, depósito, ADMIN e assinatura.
// Usada pelo cadastro self-service (/cadastro) e por scripts/nova-empresa.ts.
// Imports relativos de propósito: o script roda fora do Next (tsx).

export class ErroCadastro extends Error {
  constructor(
    public codigo: "CNPJ_DUPLICADO" | "EMAIL_DUPLICADO" | "PLANO_INEXISTENTE",
    message: string,
  ) {
    super(message);
  }
}

export function trialDias(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.TRIAL_DIAS ?? 14);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 14;
}

export type DadosNovaEmpresa = {
  razaoSocial: string;
  nomeFantasia?: string | null;
  cnpj: string; // já sem pontuação
  uf?: string | null;
  regimeTributario?: "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL";
  telefone?: string | null;
  adminNome: string;
  adminEmail: string; // minúsculo
  adminSenha: string;
  /** TRIAL: período de teste no plano de TRIAL_PLANO. INTERNO: ativa, sem limite (loja implantada à mão). */
  assinatura: { tipo: "TRIAL" } | { tipo: "INTERNO" };
  aceite?: { versao: string; ip: string | null };
};

export async function criarEmpresaComAdmin(db: PrismaClient, d: DadosNovaEmpresa, agora = new Date()) {
  const codigoPlano = d.assinatura.tipo === "INTERNO" ? "INTERNO" : (process.env.TRIAL_PLANO ?? "COMPLETO");
  const plano = await db.plano.findUnique({ where: { codigo: codigoPlano } });
  if (!plano) throw new ErroCadastro("PLANO_INEXISTENTE", `Plano ${codigoPlano} não existe. Rode as migrações.`);

  try {
    return await db.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({
        data: {
          razaoSocial: d.razaoSocial,
          nomeFantasia: d.nomeFantasia ?? d.razaoSocial,
          cnpj: d.cnpj,
          uf: d.uf ?? null,
          regimeTributario: d.regimeTributario ?? "SIMPLES_NACIONAL",
          telefone: d.telefone ?? null,
          email: d.adminEmail,
          filiais: { create: [{ nome: "Matriz" }] },
        },
        include: { filiais: true },
      });
      await tx.deposito.create({
        data: { empresaId: empresa.id, filialId: empresa.filiais[0].id, nome: "Loja", tipo: "LOJA" },
      });
      const usuario = await tx.usuario.create({
        data: {
          empresaId: empresa.id,
          nome: d.adminNome,
          email: d.adminEmail,
          senhaHash: hashSenha(d.adminSenha),
          perfil: "ADMIN",
        },
      });
      const trial = d.assinatura.tipo === "TRIAL";
      await tx.assinatura.create({
        data: {
          empresaId: empresa.id,
          planoId: plano.id,
          status: trial ? "TRIAL" : "ATIVA",
          trialFimEm: trial ? new Date(agora.getTime() + trialDias() * 24 * 3600 * 1000) : null,
        },
      });
      if (d.aceite) {
        await tx.aceiteTermos.create({
          data: { empresaId: empresa.id, usuarioId: usuario.id, versao: d.aceite.versao, ip: d.aceite.ip, aceitoEm: agora },
        });
      }
      return { empresa, usuario };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const alvo = String((e.meta as { target?: unknown })?.target ?? "");
      if (/cnpj/i.test(alvo)) throw new ErroCadastro("CNPJ_DUPLICADO", "Esta empresa já tem cadastro.");
      if (/email/i.test(alvo)) throw new ErroCadastro("EMAIL_DUPLICADO", "Este e-mail já está em uso.");
    }
    throw e;
  }
}
