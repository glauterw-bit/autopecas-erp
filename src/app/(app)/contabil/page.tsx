import Link from "next/link";
import { BookOpen, Download, FileSpreadsheet, ScrollText, Scale, Wallet, TrendingUp } from "lucide-react";
import { gerarDRE } from "@/lib/contabil/dre";
import { gerarBalanco, gerarDFC, gerarDLPA } from "@/lib/contabil/balanco";
import { PLANO_PADRAO_AUTOPECAS } from "@/lib/contabil/plano-contas";
import { empresaAtualId } from "@/lib/sessao";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ContabilPage() {
  const empresaId = await empresaAtualId();
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const [dre, bp, dfc, dlpa] = await Promise.all([
    gerarDRE({ empresaId, inicio, fim: hoje }),
    gerarBalanco({ empresaId, dataReferencia: hoje }),
    gerarDFC({ empresaId, inicio, fim: hoje }),
    gerarDLPA({ empresaId, exercicio: hoje.getFullYear() }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Contábil</h1>
          <p className="text-muted-foreground">
            Plano de contas padrão BR, DRE, livro razão, SPED ECD e EFD-ICMS/IPI.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/api/contabil/sped?tipo=ECD" target="_blank">
              <Download className="h-4 w-4" /> SPED ECD
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/api/contabil/sped?tipo=EFD" target="_blank">
              <Download className="h-4 w-4" /> SPED EFD
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/api/contabil/sped-contribuicoes" target="_blank">
              <Download className="h-4 w-4" /> SPED Contrib.
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Lucro Líquido do Mês</div>
            <div className="text-2xl font-bold">{formatBRL(dre.lucroLiquido)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Margem Bruta</div>
            <div className="text-2xl font-bold">{dre.margemBrutaPercent.toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Margem Líquida</div>
            <div className="text-2xl font-bold">{dre.margemLiquidaPercent.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" /> DRE — {inicio.toLocaleDateString("pt-BR")} a {hoje.toLocaleDateString("pt-BR")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <tbody>
              {dre.itens.map((it) => (
                <tr
                  key={it.rotulo}
                  className={`border-b ${it.rotulo.startsWith("(=)") ? "bg-secondary/40 font-semibold" : ""}`}
                >
                  <td className="px-4 py-2">{it.rotulo}</td>
                  <td className={`px-4 py-2 text-right font-mono ${it.valor < 0 ? "text-red-600" : ""}`}>
                    {formatBRL(it.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-4 w-4" /> Balanço Patrimonial — {hoje.toLocaleDateString("pt-BR")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 text-sm">
            <table className="w-full">
              <thead className="border-b bg-secondary text-left">
                <tr>
                  <th className="px-4 py-2">Ativo</th>
                  <th className="px-4 py-2 text-right">R$</th>
                </tr>
              </thead>
              <tbody>
                {bp.ativo.circulante.map((l) => (
                  <tr key={l.rotulo} className="border-b">
                    <td className="px-4 py-1.5 pl-8 text-muted-foreground">{l.rotulo}</td>
                    <td className="px-4 py-1.5 text-right font-mono">{formatBRL(l.valor)}</td>
                  </tr>
                ))}
                <tr className="border-b bg-secondary/40 font-semibold">
                  <td className="px-4 py-2">Total do Ativo</td>
                  <td className="px-4 py-2 text-right font-mono">{formatBRL(bp.ativo.total)}</td>
                </tr>
                <tr><td colSpan={2} className="px-4 py-2 bg-secondary/60 text-left font-semibold">Passivo + PL</td></tr>
                {[...bp.passivo.circulante, ...bp.passivo.naoCirculante, ...bp.passivo.patrimonioLiquido].map((l) => (
                  <tr key={l.rotulo} className="border-b">
                    <td className="px-4 py-1.5 pl-8 text-muted-foreground">{l.rotulo}</td>
                    <td className="px-4 py-1.5 text-right font-mono">{formatBRL(l.valor)}</td>
                  </tr>
                ))}
                <tr className="border-b bg-secondary/40 font-semibold">
                  <td className="px-4 py-2">Total Passivo + PL</td>
                  <td className="px-4 py-2 text-right font-mono">{formatBRL(bp.passivo.total)}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Fluxo de Caixa (DFC) — método indireto
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 text-sm">
            <table className="w-full">
              <tbody>
                {[
                  { titulo: "Atividades Operacionais", linhas: dfc.atividadesOperacionais },
                  { titulo: "Atividades de Investimento", linhas: dfc.atividadesInvestimento },
                  { titulo: "Atividades de Financiamento", linhas: dfc.atividadesFinanciamento },
                ].map((bloco) => (
                  <>
                    <tr key={bloco.titulo} className="bg-secondary/60">
                      <td colSpan={2} className="px-4 py-2 font-semibold">{bloco.titulo}</td>
                    </tr>
                    {bloco.linhas.map((l) => (
                      <tr key={l.rotulo} className="border-b">
                        <td className="px-4 py-1.5 pl-8 text-muted-foreground">{l.rotulo}</td>
                        <td className={`px-4 py-1.5 text-right font-mono ${l.valor < 0 ? "text-red-600" : ""}`}>{formatBRL(l.valor)}</td>
                      </tr>
                    ))}
                  </>
                ))}
                <tr className="border-b bg-secondary/40 font-semibold">
                  <td className="px-4 py-2">Variação de Caixa</td>
                  <td className="px-4 py-2 text-right font-mono">{formatBRL(dfc.variacaoCaixa)}</td>
                </tr>
                <tr className="border-b">
                  <td className="px-4 py-2">Saldo Final</td>
                  <td className="px-4 py-2 text-right font-mono">{formatBRL(dfc.saldoFinal)}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> DLPA — Lucros / Prejuízos Acumulados ({dlpa.exercicio})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 text-sm">
          <table className="w-full">
            <tbody>
              <tr className="border-b"><td className="px-4 py-1.5">Saldo Inicial</td><td className="px-4 py-1.5 text-right font-mono">{formatBRL(dlpa.saldoInicial)}</td></tr>
              <tr className="border-b"><td className="px-4 py-1.5">(+) Lucro do Exercício</td><td className="px-4 py-1.5 text-right font-mono">{formatBRL(dlpa.lucroExercicio)}</td></tr>
              <tr className="border-b"><td className="px-4 py-1.5">(-) Reserva Legal (5%)</td><td className="px-4 py-1.5 text-right font-mono">{formatBRL(dlpa.reservaLegal)}</td></tr>
              <tr className="border-b"><td className="px-4 py-1.5">(-) Dividendos</td><td className="px-4 py-1.5 text-right font-mono">{formatBRL(dlpa.dividendos)}</td></tr>
              <tr className="border-b bg-secondary/40 font-semibold"><td className="px-4 py-2">Saldo Final</td><td className="px-4 py-2 text-right font-mono">{formatBRL(dlpa.saldoFinal)}</td></tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="h-4 w-4" /> Plano de Contas Padrão (ITG 1000)
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 overflow-auto p-0">
            <table className="w-full text-xs">
              <tbody>
                {PLANO_PADRAO_AUTOPECAS.slice(0, 50).map((c) => (
                  <tr key={c.codigo} className={`border-b ${c.sintetica ? "font-semibold" : ""}`}>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">{c.codigo}</td>
                    <td className="px-3 py-1.5">{c.nome}</td>
                    <td className="px-3 py-1.5 text-right">
                      <Badge variant="outline">{c.natureza === "DEVEDORA" ? "D" : "C"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> Obrigações acessórias suportadas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-md border p-3">
              <span>SPED ECD (Escrituração Contábil Digital)</span>
              <Badge variant="success">disponível</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <span>SPED EFD-ICMS/IPI (Fiscal)</span>
              <Badge variant="success">disponível</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <span>SPED Contribuições (PIS/COFINS)</span>
              <Badge variant="success">disponível</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <span>PGDAS-D (Simples Nacional)</span>
              <Badge variant="success">disponível</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <span>DRE / Balanço Patrimonial</span>
              <Badge variant="success">disponível</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <span>DFC + DLPA</span>
              <Badge variant="success">disponível</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <span>DCTF / DEFIS / EFD-Reinf</span>
              <Badge variant="warning">roadmap</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
