import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { gerarBrCodePixEstatico, gerarTxid, PspPixClient } from "@/lib/pagamentos/pix";
import { prisma } from "@/lib/db";
import { empresaAtualId } from "@/lib/sessao";

const schema = z.object({
  valor: z.number().positive(),
  vendaId: z.string().optional(),
  descricao: z.string().optional(),
  // se omitido, usa Pix estático (sem PSP)
  usarPspDinamico: z.boolean().default(false),
  expiracaoSegundos: z.number().int().positive().optional(),
});

export async function POST(req: NextRequest) {
  const empresaId = await empresaAtualId();
  const body = schema.parse(await req.json());
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: empresaId },
  });
  const chave = (empresa.configuracoes as { pixChave?: string } | null)?.pixChave ?? empresa.cnpj;
  const txid = gerarTxid();

  if (body.usarPspDinamico) {
    if (
      !process.env.PSP_PIX_BASE_URL ||
      !process.env.PSP_PIX_CLIENT_ID ||
      !process.env.PSP_PIX_CLIENT_SECRET
    ) {
      return NextResponse.json(
        { erro: "PSP Pix não configurado — usando Pix estático" },
        { status: 400 },
      );
    }
    const psp = new PspPixClient({
      baseUrl: process.env.PSP_PIX_BASE_URL,
      clientId: process.env.PSP_PIX_CLIENT_ID,
      clientSecret: process.env.PSP_PIX_CLIENT_SECRET,
    });
    const cobranca = await psp.criarCobrancaImediata({
      txid,
      valor: body.valor,
      chave,
      descricao: body.descricao,
      expiracaoSegundos: body.expiracaoSegundos,
    });
    return NextResponse.json({ tipo: "dinamico", txid, ...cobranca });
  }

  const brcode = gerarBrCodePixEstatico({
    chave,
    valor: body.valor,
    beneficiario: empresa.razaoSocial,
    cidade: empresa.municipio ?? "São Paulo",
    txid,
    descricao: body.descricao,
  });
  return NextResponse.json({
    tipo: "estatico",
    txid,
    valor: body.valor,
    brcode,
    // Frontend gera o QR Code com este texto via biblioteca/canvas.
  });
}
