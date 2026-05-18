import { Brain, Camera, FileScan, MessageSquare, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { empresaAtualId } from "@/lib/sessao";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const recursos = [
  {
    icon: Camera,
    titulo: "AutoVision AI",
    descricao: "Identifica peça por foto, lê códigos OEM e sugere SKU equivalente no catálogo.",
    endpoint: "/api/ia/vision (POST)",
    tag: "vision",
  },
  {
    icon: FileScan,
    titulo: "NF-IA — OCR de DANFE",
    descricao: "Lê PDF/imagem da nota fiscal de entrada e estrutura itens com NCM, CFOP e valores.",
    endpoint: "/api/ia/ocr-nf (POST)",
    tag: "ocr",
  },
  {
    icon: TrendingUp,
    titulo: "StockPredict / DemandSense",
    descricao: "Previsão de ruptura com fatores externos (sazonalidade, clima, calendário fiscal).",
    endpoint: "/api/ia/prever-demanda (POST)",
    tag: "previsao",
  },
  {
    icon: Brain,
    titulo: "SmartCross",
    descricao: "Encontra equivalentes/aftermarket via combinação de códigos + similaridade + IA.",
    endpoint: "/api/ia/cross-reference (POST)",
    tag: "cross",
  },
  {
    icon: ShieldAlert,
    titulo: "MarginGuard",
    descricao: "Alerta na hora da venda se preço descido derruba margem mínima.",
    endpoint: "Executa inline no PDV",
    tag: "margem",
  },
  {
    icon: MessageSquare,
    titulo: "CopilotoBalcão / OmniInbox",
    descricao: "Chat com tool-use consulta catálogo, cria orçamento e responde marketplaces.",
    endpoint: "/api/ia/chat (POST)",
    tag: "chat",
  },
];

export const dynamic = "force-dynamic";

export default async function IAPage() {
  const empresaId = await empresaAtualId();
  const [insights, contagem] = await Promise.all([
    prisma.insightIA.findMany({
      where: { empresaId, resolvidoEm: null },
      orderBy: [{ severidade: "asc" }, { criadoEm: "desc" }],
      take: 30,
    }),
    prisma.insightIA.groupBy({
      by: ["tipo"],
      where: { empresaId, resolvidoEm: null },
      _count: { _all: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Sparkles className="h-7 w-7 text-accent" /> Centro de IA
        </h1>
        <p className="text-muted-foreground">
          Todos os recursos de inteligência artificial do AutoPeças ERP, com
          status de processamento e insights ativos.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {recursos.map((r) => {
          const Icon = r.icon;
          return (
            <Card key={r.titulo}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent/10 text-accent">
                    <Icon className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-base">{r.titulo}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{r.descricao}</p>
                <div className="mt-3 font-mono text-xs text-muted-foreground">{r.endpoint}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Insights ativos por tipo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {contagem.length === 0 ? (
            <span className="text-sm text-muted-foreground">Nenhum insight aberto.</span>
          ) : (
            contagem.map((c) => (
              <Badge key={c.tipo} variant="outline">
                {c.tipo}: {c._count._all}
              </Badge>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Insights detalhados</CardTitle>
          <Button asChild variant="outline">
            <Link href="/api/ia/prever-demanda" target="_blank">
              Rodar StockPredict
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {insights.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum sinal aberto. A IA continua monitorando em segundo plano.
            </div>
          ) : (
            insights.map((i) => (
              <div key={i.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{i.titulo}</div>
                  <Badge variant={i.severidade === "CRITICO" ? "destructive" : i.severidade === "AVISO" ? "warning" : "muted"}>
                    {i.tipo}
                  </Badge>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{i.descricao}</div>
                {i.acaoSugerida && (
                  <div className="mt-1 text-sm">
                    <strong>Sugestão:</strong> {i.acaoSugerida}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
