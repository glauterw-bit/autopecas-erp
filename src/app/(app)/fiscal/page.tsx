import { FileCheck2, FileX2, FileEdit, ShieldCheck, Calculator, Download, Wrench, Truck, FileBarChart, Banknote } from "lucide-react";
import { prisma } from "@/lib/db";
import { empresaAtualId } from "@/lib/sessao";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function FiscalPage() {
  const empresaId = await empresaAtualId();
  const notas = await prisma.notaFiscal.findMany({
    where: { empresaId },
    include: { cliente: true },
    orderBy: { dataEmissao: "desc" },
    take: 50,
  });
  const contagem = await prisma.notaFiscal.groupBy({
    by: ["status"],
    where: { empresaId },
    _count: { _all: true },
  });

  const operacoes = [
    {
      icon: FileX2,
      titulo: "Cancelamento de NF-e",
      descricao: "Até 24h após autorização. Justificativa mínima 15 caracteres.",
      acao: "POST /api/fiscal/operacoes { acao: 'cancelar' }",
    },
    {
      icon: FileEdit,
      titulo: "Carta de Correção (CC-e)",
      descricao: "Corrige campos não-essenciais (frete, observações). Múltiplas permitidas.",
      acao: "POST /api/fiscal/operacoes { acao: 'cce' }",
    },
    {
      icon: FileCheck2,
      titulo: "Inutilização de numeração",
      descricao: "Anula faixa de números pulados na sequência.",
      acao: "POST /api/fiscal/operacoes { acao: 'inutilizar' }",
    },
    {
      icon: ShieldCheck,
      titulo: "Manifestação do Destinatário",
      descricao:
        "Eventos 210200/210/220/240. Crítico para auto peças contra fraude em NF de entrada.",
      acao: "POST /api/fiscal/operacoes { acao: 'manifestar' }",
    },
    {
      icon: Calculator,
      titulo: "Motor de cálculo BR",
      descricao: "ICMS (27 UFs), ICMS-ST com MVA-ajustada, DIFAL + FCP, IPI, PIS/COFINS.",
      acao: "POST /api/fiscal/calcular",
    },
    {
      icon: Download,
      titulo: "SPED Fiscal (EFD-ICMS/IPI)",
      descricao: "Exporta TXT no leiaute oficial (Bloco 0, C100/C170, 9999).",
      acao: "GET /api/contabil/sped?tipo=EFD",
    },
    {
      icon: Wrench,
      titulo: "NFS-e municipal",
      descricao:
        "Emissão para serviços de oficina (LC 116/2003 códigos 14.01-14.13). Padrão ABRASF + provedores municipais.",
      acao: "POST /api/fiscal/nfse { acao: 'emitir' }",
    },
    {
      icon: Truck,
      titulo: "MDF-e (Manifesto)",
      descricao:
        "Para transporte próprio com múltiplas NF-e. Emissão, encerramento e cancelamento. Modal rodoviário.",
      acao: "POST /api/fiscal/mdfe { acao: 'emitir|encerrar|cancelar' }",
    },
    {
      icon: FileBarChart,
      titulo: "CT-e (Conhecimento Transporte)",
      descricao:
        "Emissão própria + importação de CT-e recebido (gera conta a pagar do frete automaticamente).",
      acao: "POST /api/fiscal/cte { acao: 'emitir|importar' }",
    },
    {
      icon: Banknote,
      titulo: "PGDAS-D — Simples Nacional",
      descricao:
        "Apuração mensal: faixa pela RBT12, alíquota efetiva, valor devido, repartição por tributo, geração DAS.",
      acao: "GET /api/fiscal/pgdas?competencia=YYYY-MM",
    },
    {
      icon: Download,
      titulo: "SPED Contribuições (PIS/COFINS)",
      descricao:
        "Escrituração mensal das contribuições (regimes cumulativo e não-cumulativo).",
      acao: "GET /api/contabil/sped-contribuicoes",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Fiscal</h1>
        <p className="text-muted-foreground">
          NF-e/NFC-e completas: emissão, cancelamento, CC-e, inutilização,
          manifestação do destinatário, cálculo tributário e SPED.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {contagem.map((c) => (
          <Card key={c.status}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{c.status}</div>
              <div className="text-2xl font-bold">{c._count._all}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Operações disponíveis</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {operacoes.map((op) => {
            const Icon = op.icon;
            return (
              <Card key={op.titulo}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent/10 text-accent">
                      <Icon className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base">{op.titulo}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{op.descricao}</p>
                  <div className="mt-3 font-mono text-xs text-muted-foreground">{op.acao}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimas notas fiscais</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary text-left">
              <tr>
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Modelo</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Emissão</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {notas.map((n) => (
                <tr key={n.id} className="border-b hover:bg-secondary/50">
                  <td className="px-4 py-2 font-mono">{String(n.numero).padStart(6, "0")}</td>
                  <td className="px-4 py-2">{n.modelo}</td>
                  <td className="px-4 py-2">{n.cliente?.nome ?? "Consumidor"}</td>
                  <td className="px-4 py-2 text-xs">{formatDateTime(n.dataEmissao)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatBRL(Number(n.valorTotal))}</td>
                  <td className="px-4 py-2">
                    <Badge
                      variant={
                        n.status === "AUTORIZADA" ? "success" :
                        n.status === "CANCELADA" || n.status === "DENEGADA" ? "destructive" :
                        "warning"
                      }
                    >
                      {n.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {notas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhuma nota emitida ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
