import Link from "next/link";
import { ArrowRight, Brain, Camera, Cpu, ShoppingCart, Sparkles, Store, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

// Cada item diz o estado real do código. Antes de mudar um status para
// "Disponível", confira no código e atualize a matriz do README.
type Status = "Disponível" | "Beta" | "Em desenvolvimento";

const recursos: { icon: typeof Camera; titulo: string; status: Status; descricao: string }[] = [
  {
    icon: ShoppingCart,
    titulo: "Balcão (PDV)",
    status: "Disponível",
    descricao:
      "Busca por código, SKU, OEM ou nome, leitor de código de barras e atalhos de teclado. Desconto acima do limite do perfil e preço abaixo do mínimo são bloqueados.",
  },
  {
    icon: Cpu,
    titulo: "StockPredict",
    status: "Beta",
    descricao:
      "Sugere quando e quanto repor a partir do histórico de vendas. A compra é sempre decisão de quem compra.",
  },
  {
    icon: Store,
    titulo: "Marketplaces",
    status: "Beta",
    descricao:
      "Mercado Livre, Shopee, Amazon e Magalu numa interface única, com compatibilidade de autopeças no Mercado Livre. Ainda em teste com contas reais.",
  },
  {
    icon: Camera,
    titulo: "AutoVision",
    status: "Em desenvolvimento",
    descricao:
      "Foto da peça para a IA sugerir categoria, marca e códigos. Quem atende confirma antes de usar.",
  },
  {
    icon: Brain,
    titulo: "SmartCross",
    status: "Em desenvolvimento",
    descricao: "Sugestão de peça equivalente entre OEM e reposição, sempre com confirmação humana.",
  },
  {
    icon: Zap,
    titulo: "NF-IA",
    status: "Em desenvolvimento",
    descricao:
      "Leitura de DANFE por IA para conferir antes de dar entrada. A precisão será medida na loja piloto.",
  },
];

const corStatus: Record<Status, string> = {
  "Disponível": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  Beta: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  "Em desenvolvimento": "bg-secondary text-muted-foreground",
};

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
            ERP de autopeças com IA da OpenAI que sugere e você confirma
          </div>
          <h1 className="text-5xl font-bold tracking-tight">
            Venda mais, compra melhor e fecha o caixa sem dor.
          </h1>
          <p className="text-lg text-muted-foreground">
            PDV, estoque, financeiro, fiscal NF-e/NFC-e, marketplaces e catálogo
            veicular numa plataforma só. O sistema está em fase de piloto: abaixo
            está o que já funciona e o que ainda está em construção.
          </p>
          <div className="flex gap-3">
            <Button size="lg" asChild variant="accent">
              <Link href="/pdv">Abrir Frente de Caixa</Link>
            </Button>
            <Button size="lg" asChild variant="outline">
              <Link href="/ia">Ver recursos de IA</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-t bg-card">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="mb-8 text-2xl font-bold">O que já funciona e o que está chegando</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {recursos.map((d) => {
              const Icon = d.icon;
              return (
                <div key={d.titulo} className="rounded-xl border bg-background p-6">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-semibold">{d.titulo}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${corStatus[d.status]}`}>
                      {d.status}
                    </span>
                  </div>
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
