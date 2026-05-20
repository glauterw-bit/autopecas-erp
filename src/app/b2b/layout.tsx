import Link from "next/link";
import { Car, FileText, History, Home, LogOut, ShoppingBag } from "lucide-react";

export const metadata = {
  title: "Portal do Cliente — AutoPeças",
  description: "Catálogo, pedidos e histórico para mecânicas, frotistas e revendas.",
};

export default function B2BLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/b2b" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <ShoppingBag className="h-4 w-4" />
            </div>
            <div className="text-sm">
              <div className="font-semibold leading-tight">Portal Cliente</div>
              <div className="text-xs text-muted-foreground leading-tight">AutoPeças</div>
            </div>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <NavLink href="/b2b" icon={Home} label="Início" />
            <NavLink href="/b2b/catalogo" icon={ShoppingBag} label="Catálogo" />
            <NavLink href="/b2b/garagem" icon={Car} label="Garagem" />
            <NavLink href="/b2b/pedidos" icon={History} label="Pedidos" />
            <NavLink href="/b2b/faturas" icon={FileText} label="Faturas" />
            <form action="/api/b2b/logout" method="post">
              <button className="rounded-md p-2 text-muted-foreground hover:bg-secondary">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}

function NavLink({ href, icon: Icon, label }: { href: string; icon: typeof Home; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
      <span className="hidden md:inline">{label}</span>
    </Link>
  );
}
