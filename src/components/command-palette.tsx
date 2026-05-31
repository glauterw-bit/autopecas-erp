"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, LayoutDashboard, ShoppingCart, Package, Users, Car, Truck, Scan,
  Wallet, Wrench, Percent, FileText, BookOpen, Store, Globe, RotateCcw,
  HardDrive, Sparkles, BarChart3, Settings, Command as CmdIcon,
} from "lucide-react";

interface Item {
  label: string;
  href: string;
  icon: typeof Search;
  keywords?: string;
}

const ITENS: Item[] = [
  { label: "Frente de Caixa (PDV)", href: "/pdv", icon: ShoppingCart, keywords: "venda caixa pdv vender" },
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, keywords: "inicio painel home" },
  { label: "Produtos", href: "/produtos", icon: Package, keywords: "peça peca catalogo estoque sku" },
  { label: "Clientes", href: "/clientes", icon: Users, keywords: "cliente mecanico frotista" },
  { label: "Veículos", href: "/veiculos", icon: Car, keywords: "carro montadora modelo aplicacao" },
  { label: "Fornecedores", href: "/fornecedores", icon: Truck, keywords: "fornecedor compra" },
  { label: "Compras / NF-IA", href: "/compras", icon: Scan, keywords: "nota entrada ocr danfe" },
  { label: "Financeiro", href: "/financeiro", icon: Wallet, keywords: "contas pagar receber caixa banco" },
  { label: "Ordem de Serviço", href: "/os", icon: Wrench, keywords: "oficina servico os mecanica" },
  { label: "Comissões", href: "/comissoes", icon: Percent, keywords: "vendedor comissao meta" },
  { label: "Fiscal NF-e", href: "/fiscal", icon: FileText, keywords: "nota fiscal nfe nfce sped imposto" },
  { label: "Contábil / SPED", href: "/contabil", icon: BookOpen, keywords: "dre balanco sped contabil" },
  { label: "Marketplaces", href: "/marketplaces", icon: Store, keywords: "mercado livre shopee amazon magalu" },
  { label: "Portal B2B", href: "/b2b", icon: Globe, keywords: "cliente portal b2b" },
  { label: "RMA / Devoluções", href: "/rma", icon: RotateCcw, keywords: "devolucao garantia troca rma" },
  { label: "Hardware PDV", href: "/hardware", icon: HardDrive, keywords: "tef sat impressora balanca pinpad" },
  { label: "Centro de IA", href: "/ia", icon: Sparkles, keywords: "inteligencia artificial vision ocr" },
  { label: "Relatórios", href: "/relatorios", icon: BarChart3, keywords: "relatorio analise" },
  { label: "Configurações", href: "/configuracoes", icon: Settings, keywords: "config ajuste empresa" },
];

function normalizar(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function CommandPalette() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberto((a) => !a);
      } else if (e.key === "Escape") {
        setAberto(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (aberto) {
      setQ("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [aberto]);

  const filtrados = useMemo(() => {
    if (!q) return ITENS;
    const nq = normalizar(q);
    return ITENS.filter(
      (it) => normalizar(it.label).includes(nq) || normalizar(it.keywords ?? "").includes(nq),
    );
  }, [q]);

  function ir(href: string) {
    setAberto(false);
    router.push(href);
  }

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-4 pt-[12vh]" onClick={() => setAberto(false)}>
      <div className="w-full max-w-lg overflow-hidden rounded-xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, filtrados.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === "Enter" && filtrados[sel]) { e.preventDefault(); ir(filtrados[sel].href); }
            }}
            placeholder="Para onde vamos? (ex.: venda, fiscal, comissão…)"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-auto p-2">
          {filtrados.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">Nada encontrado.</div>
          )}
          {filtrados.map((it, idx) => {
            const Icon = it.icon;
            return (
              <button
                key={it.href}
                onClick={() => ir(it.href)}
                onMouseEnter={() => setSel(idx)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${idx === sel ? "bg-accent/10 text-accent" : "hover:bg-secondary"}`}
              >
                <Icon className="h-4 w-4" />
                {it.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t px-4 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><CmdIcon className="h-3 w-3" /> Ctrl+K para abrir</span>
          <span>↑↓ navega · Enter abre</span>
        </div>
      </div>
    </div>
  );
}
