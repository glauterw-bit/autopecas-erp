import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { empresaAtualId } from "@/lib/sessao";

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

export async function GET(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const q = req.nextUrl.searchParams.get("q");
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
  return NextResponse.json(clientes);
}

export async function POST(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const body = clienteSchema.parse(await req.json());
  const cliente = await prisma.cliente.create({ data: { ...body, empresaId } });
  return NextResponse.json(cliente, { status: 201 });
}
