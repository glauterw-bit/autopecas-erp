import Link from "next/link";
import { Camera, FileText, MessageCircle, Plus, ScanLine, Sparkles } from "lucide-react";

const acoes = [
  { href: "/m/scanner", icon: ScanLine, label: "Bipar peça", cor: "bg-orange-500" },
  { href: "/m/catalogo", icon: Camera, label: "Foto + IA", cor: "bg-purple-500" },
  { href: "/m/orcamento", icon: Plus, label: "Novo orçamento", cor: "bg-emerald-500" },
  { href: "/m/clientes", icon: MessageCircle, label: "Clientes", cor: "bg-blue-500" },
  { href: "/m/historico", icon: FileText, label: "Histórico", cor: "bg-slate-600" },
  { href: "/m/ia", icon: Sparkles, label: "Copiloto IA", cor: "bg-pink-500" },
];

export default function MobileHome() {
  return (
    <div className="p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Olá, vendedor</h1>
        <p className="text-sm text-muted-foreground">O que vamos fazer hoje?</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {acoes.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.href}
              href={a.href}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl bg-card p-4 shadow-sm transition-transform active:scale-95"
            >
              <div className={`${a.cor} flex h-14 w-14 items-center justify-center rounded-2xl text-white`}>
                <Icon className="h-7 w-7" />
              </div>
              <span className="text-sm font-medium">{a.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
