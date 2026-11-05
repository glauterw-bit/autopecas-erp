import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth } from "@/lib/auth/guard";
import { registrarAuditoria } from "@/lib/auth/auditoria";
import { tarefasDaEmpresa } from "@/lib/empresas/onboarding";

// Dados da própria empresa (só ADMIN): leitura e edição do cadastro básico,
// usado pelo onboarding. O CNPJ não muda por aqui. Mudar o regime tributário
// é mudança fiscal: fica no LogAuditoria com antes e depois.
const vazioNulo = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const texto = (max: number) => z.preprocess(vazioNulo, z.string().trim().max(max).nullable().optional());

const patchSchema = z.object({
  nomeFantasia: texto(150),
  inscEstadual: texto(20),
  inscMunicipal: texto(20),
  regimeTributario: z.enum(["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL"]).optional(),
  cep: z.preprocess((v) => (typeof v === "string" ? v.replace(/\D/g, "") || null : v), z.string().regex(/^\d{8}$/, "CEP precisa ter 8 números.").nullable().optional()),
  logradouro: texto(150),
  numero: texto(20),
  complemento: texto(80),
  bairro: texto(80),
  municipio: texto(80),
  uf: z.preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() || null : v), z.string().regex(/^[A-Z]{2}$/, "UF com 2 letras.").nullable().optional()),
});

const CAMPOS = ["razaoSocial", "nomeFantasia", "cnpj", "inscEstadual", "inscMunicipal", "regimeTributario", "cep", "logradouro", "numero", "complemento", "bairro", "municipio", "uf", "telefone", "email"] as const;

export const GET = comAuth("ADMIN", async (_req, _ctx, usuario) => {
  const select = Object.fromEntries(CAMPOS.map((c) => [c, true])) as Record<(typeof CAMPOS)[number], true>;
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: usuario.empresaId }, select });
  return NextResponse.json({ empresa, tarefas: await tarefasDaEmpresa(usuario.empresaId) });
});

export const PATCH = comAuth("ADMIN", async (req, _ctx, usuario) => {
  const body = patchSchema.parse(await req.json());
  const empresaId = usuario.empresaId;
  const antes = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
  const dados = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  await prisma.$transaction(async (tx) => {
    await tx.empresa.update({ where: { id: empresaId }, data: dados });
    if (body.regimeTributario) {
      // Confirmação do regime (onboarding). Mescla só a chave "onboarding" sem
      // sobrescrever o resto de configuracoes (fiscal, integrações).
      await tx.$executeRaw`UPDATE "empresas" SET "configuracoes" = COALESCE("configuracoes", '{}'::jsonb) || jsonb_build_object('onboarding', COALESCE("configuracoes"->'onboarding', '{}'::jsonb) || jsonb_build_object('regimeConfirmadoEm', ${new Date().toISOString()}::text)) WHERE "id" = ${empresaId}`;
    }
    if (body.regimeTributario && body.regimeTributario !== antes.regimeTributario) {
      await registrarAuditoria(tx, {
        empresaId, usuarioId: usuario.id, acao: "EMPRESA_REGIME_ALTERADO", entidade: "Empresa", entidadeId: empresaId,
        antes: { regimeTributario: antes.regimeTributario }, depois: { regimeTributario: body.regimeTributario },
      });
    }
  });
  return NextResponse.json({ ok: true, tarefas: await tarefasDaEmpresa(empresaId) });
});
