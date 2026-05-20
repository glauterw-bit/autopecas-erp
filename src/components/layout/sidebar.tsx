"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Truck,
  Car,
  Receipt,
  Store,
  Wallet,
  Sparkles,
  BarChart3,
  Settings,
  Scan,
  FileText,
  BookOpen,
  HardDrive,
  RotateCcw,
  Percent,
  Globe,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

const itens = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pdv", label: "Frente de Caixa", icon: ShoppingCart, accent: true },
  { href: "/produtos", label: "Produtos", icon: Package },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/veiculos", label: "Veículos", icon: Car },
  { href: "/fornecedores", label: "Fornecedores", icon: Truck },
  { href: "/compras", label: "Compras / NF-IA", icon: Scan },
  { href: "/financeiro", label: "Financeiro", icon: Wallet },
  { href: "/comissoes", label: "Comissões", icon: Percent },
  { href: "/fiscal", label: "Fiscal NF-e", icon: FileText },
  { href: "/contabil", label: "Contábil / SPED", icon: BookOpen },
  { href: "/marketplaces", label: "Marketplaces", icon: Store },
  { href: "/b2b", label: "Portal B2B", icon: Globe },
  { href: "/rma", label: "RMA / Devoluções", icon: RotateCcw },
  { href: "/hardware", label: "Hardware PDV", icon: HardDrive },
  { href: "/m", label: "App Mobile (PWA)", icon: Smartphone },
  { href: "/ia", label: "Centro de IA", icon: Sparkles, accent: true },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Receipt className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">AutoPeças</div>
          <div className="text-xs text-muted-foreground leading-tight">ERP · IA</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {itens.map((it) => {
          const Icon = it.icon;
          const ativo = path?.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                ativo
                  ? "bg-secondary text-secondary-foreground font-medium"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                it.accent && !ativo && "text-accent",
              )}
            >
              <Icon className="h-4 w-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4 text-xs text-muted-foreground">
        <div className="font-semibold text-foreground">Loja Demo</div>
        <div>CNPJ 00.000.000/0001-00</div>
      </div>
    </aside>
  );
}
