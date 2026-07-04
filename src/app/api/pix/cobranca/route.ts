import { NextResponse } from "next/server";
import { z } from "zod";
import { gerarBrCodePixEstatico, gerarTxid, PspPixClient } from "@/lib/pagamentos/pix";
import { prisma } from "@/lib/db";
import { comAuth } from "@/lib/auth/guard";

const schema = z.object({
  valor: z.number().positive(),
  vendaId: z.string().optional(),
  descricao: z.string().optional(),
  // se omitido, usa Pix estático (sem PSP)
  usarPspDinamico: z.boolean().default(false),
  expiracaoSegundos: z.number().int().positive().optional(),
});

export const POST = comAuth("CAIXA", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const body = schema.parse(await req.json());
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: empresaId },
  });
  const chave = (empresa.configuracoes as { pixChave?: string } | null)?.pixChave ?? empresa.cnpj;
  const txid = gerarTxid();

  // Persiste o txid na venda/conta a receber — é por ele que o webhook
  // /api/webhooks/pix dá baixa automática quando o PSP confirma o pagamento.
  if (body.vendaId) {
    const venda = await prisma.venda.findFirst({
      where: { id: body.vendaId, empresaId },
      select: {
        id: true,
        contasReceber: {
          where: {
            empresaId,
            documento: null,
            // Nunca carimbar parcelas de crediário/boleto: o webhook Pix
            // baixaria uma parcela que o cliente ainda vai pagar por outro meio.
            formaPagamento: "PIX",
            status: { in: ["ABERTO", "PARCIALMENTE_PAGO", "ATRASADO"] },
          },
          orderBy: { dataVencimento: "asc" },
          select: { id: true, valor: true, valorRecebido: true },
        },
      },
    });
    if (venda) {
      await prisma.pagamentoVenda.updateMany({
        where: { vendaId: venda.id, formaPagamento: "PIX", nsuAutorizacao: null },
        data: { nsuAutorizacao: txid },
      });
      // Carimba UMA conta PIX em aberto: preferindo a de valor compatível
      // (tolerância 1%) com a cobrança; senão, a primeira a vencer.
      const compativel = venda.contasReceber.find(
        (cr) => Math.abs(Number(cr.valor) - Number(cr.valorRecebido) - body.valor) <= body.valor * 0.01,
      );
      const alvo = compativel ?? venda.contasReceber[0];
      if (alvo) {
        await prisma.contaReceber.updateMany({
          where: { id: alvo.id, documento: null },
          data: { documento: txid },
        });
      }
    }
  }

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
});
