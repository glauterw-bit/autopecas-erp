import Link from "next/link";
import { ArrowRight, Brain, Camera, Cpu, ShoppingCart, Sparkles, Store, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const diferenciais = [
  {
    icon: Camera,
    titulo: "AutoVision AI",
    descricao: "Foto da peça identifica categoria, marca, OEM e sugere SKU equivalente em segundos.",
  },
  {
    icon: Cpu,
    titulo: "StockPredict",
    descricao: "ML híbrido prevê ruptura considerando sazonalidade, clima e calendário fiscal.",
  },
  {
    icon: Brain,
    titulo: "SmartCross",
    descricao: "Cross-reference entre OEM e aftermarket com julgamento técnico via IA.",
  },
  {
    icon: Zap,
    titulo: "NF-IA",
    descricao: "OCR de DANFE com 97%+ de precisão converte nota em entrada de estoque automaticamente.",
  },
  {
    icon: ShoppingCart,
    titulo: "PDV inteligente",
    descricao: "Busca por placa, por aplicação, por código de barras ou por voz. MarginGuard impede queima.",
  },
  {
    icon: Store,
    titulo: "OmniInbox",
    descricao: "Mercado Livre, Shopee, Amazon e WhatsApp em uma caixa única com respostas sugeridas por IA.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="font-semibold">AutoPeças ERP</div>
          </div>
          <Button asChild>
            <Link href="/dashboard">
              Acessar sistema <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border bg-secondary px-3 py-1 text-xs">
            <Sparkles className="h-3 w-3 text-accent" />
            O ERP de auto peças com IA Claude no núcleo
          </div>
          <h1 className="text-5xl font-bold tracking-tight">
            Venda mais, compra melhor e fecha o caixa sem dor.
          </h1>
          <p className="text-lg text-muted-foreground">
            PDV, financeiro, fiscal NF-e/NFC-e, marketplaces e catálogo veicular
            integrados em uma plataforma única — com inteligência artificial
            que identifica peça por foto, prevê ruptura, lê DANFE e responde
            cliente no marketplace.
          </p>
          <div className="flex gap-3">
            <Button size="lg" asChild variant="accent">
              <Link href="/pdv">Abrir Frente de Caixa</Link>
            </Button>
            <Button size="lg" asChild variant="outline">
              <Link href="/ia">Ver IA em ação</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-t bg-card">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="mb-8 text-2xl font-bold">Diferenciais que ninguém mais tem</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {diferenciais.map((d) => {
              const Icon = d.icon;
              return (
                <div key={d.titulo} className="rounded-xl border bg-background p-6">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="mb-1 font-semibold">{d.titulo}</div>
                  <p className="text-sm text-muted-foreground">{d.descricao}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
