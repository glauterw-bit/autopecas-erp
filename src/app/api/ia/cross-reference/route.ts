import { NextResponse } from "next/server";
import { z } from "zod";
import { buscarEquivalentes, salvarCrossReference } from "@/lib/ai/cross-reference";
import { exigirLimiteIA } from "@/lib/ai/limite";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";

const opc = z.string().max(200).optional().nullable();
const corpoSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  marca: opc,
  codigoOem: opc,
  codigoFabricante: opc,
  sistema: opc,
  // Confirmação humana de UMA sugestão: a IA sugere, a pessoa escolhe e grava.
  salvar: z
    .object({
      origemId: z.string(),
      destinoId: z.string(),
      tipo: z.enum(["EQUIVALENTE", "SIMILAR", "SUBSTITUTO", "KIT_ALTERNATIVO"]),
      confianca: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export const POST = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  await exigirLimiteIA("crossReference", usuario.id);
  const { salvar, ...alvo } = corpoSchema.parse(await req.json());

  if (salvar) {
    const doTenant = await prisma.produto.count({
      where: { id: { in: [salvar.origemId, salvar.destinoId] }, empresaId },
    });
    if (salvar.origemId === salvar.destinoId || doTenant !== 2) {
      throw new ApiError(404, "Produto não encontrado");
    }
    const cr = await salvarCrossReference(
      salvar.origemId,
      salvar.destinoId,
      salvar.tipo,
      salvar.confianca ?? 1,
      "IA-SmartCross (confirmado por usuário)",
    );
    return NextResponse.json({ salvo: true, id: cr.id });
  }

  const resultados = await buscarEquivalentes(empresaId, alvo);
  return NextResponse.json(resultados);
});
