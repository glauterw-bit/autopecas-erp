import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { MercadoLivreAdapter } from "@/lib/marketplaces/mercado-livre";
import { sincronizarCompatibilidadesProduto } from "@/lib/marketplaces/ml-compatibilidades";

// Compatibilidades de autopeças no Mercado Livre a partir da aplicação
// veicular do produto. Sem `confirmar: true` é só simulação: devolve o que
// seria enviado (e as versões sem correspondência) sem tocar no anúncio.
// Enviar exige confirmação de quem tem perfil GERENTE ou acima.

const schema = z.object({
  contaId: z.string().min(1),
  produtoId: z.string().min(1),
  confirmar: z.boolean().default(false),
});

export const POST = comAuth("GERENTE", async (req, _ctx, usuario) => {
  const body = schema.parse(await req.json());
  const conta = await prisma.marketplaceConta.findFirst({
    where: { id: body.contaId, empresaId: usuario.empresaId, plataforma: "MERCADO_LIVRE", ativa: true },
    select: { id: true },
  });
  if (!conta) throw new ApiError(404, "Conta do Mercado Livre não encontrada");
  const resultados = await sincronizarCompatibilidadesProduto({
    ml: new MercadoLivreAdapter(conta.id),
    contaId: conta.id,
    empresaId: usuario.empresaId,
    produtoId: body.produtoId,
    confirmar: body.confirmar,
    usuarioId: usuario.id,
  });
  return NextResponse.json({ simulacao: !body.confirmar, resultados });
});
