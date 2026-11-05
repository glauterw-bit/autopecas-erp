import { acessoDaEmpresa } from "@/lib/assinatura/politica";
import { creditoBloqueadoPeloModo } from "@/lib/assinatura/estado";
import { limparTermoBusca } from "@/lib/catalogo/busca-normalizar";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { podePerfil } from "@/lib/auth/config";
import { protegerCliente } from "@/lib/crm/acesso";

const clienteSchema = z.object({
  tipo: z.enum(["PF", "PJ", "ESTRANGEIRO"]).default("PF"),
  cpfCnpj: z.string().optional().nullable(),
  nome: z.string().min(2),
  email: z.string().email().optional().nullable(),
  telefone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  segmento: z
    .enum([
      "CONSUMIDOR_FINAL",
      "MECANICA",
      "REVENDA",
      "FROTISTA",
      "CONCESSIONARIA",
      "SEGURADORA",
      "ATACADISTA",
    ])
    .default("CONSUMIDOR_FINAL"),
  logradouro: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  bairro: z.string().optional().nullable(),
  municipio: z.string().optional().nullable(),
  uf: z.string().length(2).optional().nullable(),
  cep: z.string().optional().nullable(),
  limiteCredito: z.number().nonnegative().default(0),
});

export const GET = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const q = limparTermoBusca(req.nextUrl.searchParams.get("q"));
  const clientes = await prisma.cliente.findMany({
    where: {
      empresaId,
      ...(q && {
        OR: [
          { nome: { contains: q, mode: "insensitive" } },
          { cpfCnpj: { contains: q } },
          { telefone: { contains: q } },
          { whatsapp: { contains: q } },
        ],
      }),
    },
    include: { veiculos: { include: { versao: { include: { modelo: true } } } } },
    take: 100,
    orderBy: { nome: "asc" },
  });
  // LGPD: documento completo, limite, saldo e score só para FINANCEIRO+ ou
  // para a pessoa vendedora responsável pela carteira.
  return NextResponse.json(clientes.map((c) => protegerCliente(usuario, c)));
});

export const POST = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const body = clienteSchema.parse(await req.json());
  // Limite de crédito só com perfil FINANCEIRO ou acima.
  if (body.limiteCredito > 0 && !podePerfil(usuario.perfil, "FINANCEIRO")) {
    throw new ApiError(403, "Limite de crédito só pode ser definido pelo financeiro ou pela gerência.");
  }
  // Assinatura em somente leitura: o cadastro rápido do balcão segue, mas sem crédito.
  if (body.limiteCredito > 0) {
    const { modo } = await acessoDaEmpresa(empresaId);
    if (creditoBloqueadoPeloModo(modo, body.limiteCredito)) {
      throw new ApiError(402, "Com a assinatura em atraso, o cliente pode ser cadastrado, mas sem limite de crédito. Regularize em Configurações > Assinatura.");
    }
  }
  const cliente = await prisma.cliente.create({ data: { ...body, empresaId } });
  return NextResponse.json(protegerCliente(usuario, cliente), { status: 201 });
});
