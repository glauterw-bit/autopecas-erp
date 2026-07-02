import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { garantirPlanoContasPadrao, gerarLancamentosPeriodo } from "@/lib/contabil/lancamentos";

// Lançamentos contábeis (partidas dobradas) — perfil FINANCEIRO+.
// GET  ?de=&ate=          → lançamentos do período + razão resumido por conta
// POST {acao:"gerar",...} → garante o plano padrão e gera os lançamentos

function periodoDaQuery(url: URL): { de: Date; ate: Date } {
  const agora = new Date();
  const deStr = url.searchParams.get("de");
  const ateStr = url.searchParams.get("ate");
  const de = deStr ? new Date(deStr) : new Date(agora.getFullYear(), agora.getMonth(), 1);
  const ate = ateStr ? new Date(`${ateStr}T23:59:59.999`) : agora;
  if (isNaN(de.getTime()) || isNaN(ate.getTime())) {
    throw new ApiError(400, "Período inválido: use ?de=AAAA-MM-DD&ate=AAAA-MM-DD");
  }
  if (de > ate) throw new ApiError(400, "Data inicial maior que a final");
  return { de, ate };
}

export const GET = comAuth("FINANCEIRO", async (req, _ctx, usuario) => {
  const { de, ate } = periodoDaQuery(new URL(req.url));

  const lancamentos = await prisma.lancamentoContabil.findMany({
    where: { empresaId: usuario.empresaId, data: { gte: de, lte: ate } },
    include: {
      partidas: {
        include: { planoConta: { select: { codigo: true, nome: true } } },
      },
    },
    orderBy: [{ data: "asc" }, { criadoEm: "asc" }],
  });

  // Razão resumido: total débito/crédito/saldo por conta (saldo devedor > 0).
  const razaoPorConta = new Map<
    string,
    { codigo: string; nome: string; debito: number; credito: number }
  >();
  for (const l of lancamentos) {
    for (const p of l.partidas) {
      const acc = razaoPorConta.get(p.planoConta.codigo) ?? {
        codigo: p.planoConta.codigo,
        nome: p.planoConta.nome,
        debito: 0,
        credito: 0,
      };
      if (p.natureza === "DEBITO") acc.debito += Number(p.valor);
      else acc.credito += Number(p.valor);
      razaoPorConta.set(p.planoConta.codigo, acc);
    }
  }
  const razao = [...razaoPorConta.values()]
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
    .map((c) => ({
      codigo: c.codigo,
      nome: c.nome,
      totalDebito: Number(c.debito.toFixed(2)),
      totalCredito: Number(c.credito.toFixed(2)),
      saldo: Number((c.debito - c.credito).toFixed(2)),
    }));

  return NextResponse.json({
    periodo: { de: de.toISOString(), ate: ate.toISOString() },
    total: lancamentos.length,
    lancamentos: lancamentos.map((l) => ({
      id: l.id,
      data: l.data.toISOString(),
      historico: l.historico,
      origemTipo: l.origemTipo,
      origemId: l.origemId,
      partidas: l.partidas.map((p) => ({
        conta: p.planoConta.codigo,
        contaNome: p.planoConta.nome,
        natureza: p.natureza,
        valor: Number(p.valor),
      })),
    })),
    razao,
  });
});

const schemaGerar = z.object({
  acao: z.literal("gerar"),
  de: z.string().min(10, "Informe a data inicial (AAAA-MM-DD)"),
  ate: z.string().min(10, "Informe a data final (AAAA-MM-DD)"),
});

export const POST = comAuth("FINANCEIRO", async (req, _ctx, usuario) => {
  const body = schemaGerar.parse(await req.json());
  const de = new Date(body.de);
  const ate = new Date(`${body.ate}T23:59:59.999`);
  if (isNaN(de.getTime()) || isNaN(ate.getTime())) {
    throw new ApiError(400, "Datas inválidas: use AAAA-MM-DD");
  }
  if (de > ate) throw new ApiError(400, "Data inicial maior que a final");

  await garantirPlanoContasPadrao();
  const resumo = await gerarLancamentosPeriodo(usuario.empresaId, de, ate);
  return NextResponse.json({ ok: true, ...resumo });
});
