import { NextResponse } from "next/server";
import { z } from "zod";
import { comAuth } from "@/lib/auth/guard";
import { emitirNotaDevolucao } from "@/lib/nfe/devolucao";
import { emitirNotaDevolucaoRMA } from "@/lib/rma/rma";

// NF-e de devolução de venda referenciando a nota original por item.
// Fiscal: FINANCEIRO ou acima. empresaId sempre da sessão.
const schema = z.union([
  z.object({ rmaId: z.string().min(1) }),
  z.object({
    vendaId: z.string().min(1),
    itens: z
      .array(z.object({ itemVendaId: z.string().min(1), quantidade: z.number().positive() }))
      .min(1),
  }),
]);

export const POST = comAuth("FINANCEIRO", async (req, _ctx, usuario) => {
  const body = schema.parse(await req.json());
  const nota =
    "rmaId" in body
      ? await emitirNotaDevolucaoRMA(body.rmaId, usuario.empresaId)
      : await emitirNotaDevolucao({ empresaId: usuario.empresaId, vendaId: body.vendaId, itens: body.itens });
  return NextResponse.json(nota);
});
