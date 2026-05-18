import Link from "next/link";
import { BookOpen, Download, FileSpreadsheet, ScrollText } from "lucide-react";
import { gerarDRE } from "@/lib/contabil/dre";
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
  const dre = await gerarDRE({ empresaId, inicio, fim: hoje });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Contábil</h1>
          <p className="text-muted-foreground">
            Plano de contas padrão BR, DRE, livro razão, SPED ECD e EFD-ICMS/IPI.
          </p>
        </div>
        <div className="flex gap-2">
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
              <Badge variant="warning">roadmap</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <span>PGDAS-D (Simples Nacional)</span>
              <Badge variant="warning">roadmap</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <span>DCTF / DEFIS</span>
              <Badge variant="warning">roadmap</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <span>DRE / Balanço Patrimonial</span>
              <Badge variant="success">disponível</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
