"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LifeBuoy,
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
  Wrench,
  Banknote,
  Boxes,
  LogOut,
  UserCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { podeAbrirRota } from "@/lib/auth/perfis";

const itens = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pdv", label: "Frente de Caixa", icon: ShoppingCart, accent: true },
  { href: "/caixa", label: "Gestão de Caixa", icon: Banknote },
  { href: "/produtos", label: "Produtos", icon: Package },
  { href: "/estoque", label: "Estoque", icon: Boxes },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/veiculos", label: "Veículos", icon: Car },
  { href: "/fornecedores", label: "Fornecedores", icon: Truck },
  { href: "/compras", label: "Compras / NF-IA", icon: Scan },
  { href: "/financeiro", label: "Financeiro", icon: Wallet },
  { href: "/os", label: "Ordem de Serviço", icon: Wrench },
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

export function Sidebar({
  perfil,
  nomeUsuario,
  nomeEmpresa,
}: {
  perfil: string;
  nomeUsuario: string;
  nomeEmpresa: string;
}) {
  const path = usePathname();
  // Esconde o que o perfil não pode abrir (a página também confere no servidor).
  const visiveis = itens.filter((it) => podeAbrirRota(perfil, it.href));
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
        {visiveis.map((it) => {
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
      <div className="border-t p-2">
        <ThemeToggle />
      </div>
      <div className="border-t p-4 text-xs text-muted-foreground">
        <div className="truncate font-semibold text-foreground" title={nomeEmpresa}>
          {nomeEmpresa}
        </div>
        <div className="truncate" title={nomeUsuario}>
          {nomeUsuario}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Link
            href="/conta"
            className="flex flex-1 items-center gap-1 rounded-md border px-2 py-1.5 text-foreground hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <UserCircle className="h-3.5 w-3.5" /> Minha conta
          </Link>
          <Link
            href="/ajuda"
            className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-foreground hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <LifeBuoy className="h-3.5 w-3.5" /> Ajuda
          </Link>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-foreground hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <LogOut className="h-3.5 w-3.5" /> Sair
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
