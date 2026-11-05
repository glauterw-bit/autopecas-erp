import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Home, Search, ScanLine, Users } from "lucide-react";
import { usuarioDaSessao } from "@/lib/auth/config";

export const metadata: Metadata = {
  title: "AutoPeças — Vendedor",
  description: "PWA do vendedor externo",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AutoPeças",
  },
};

export const viewport: Viewport = {
  themeColor: "#ea580c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// Sem sessão válida, vai para o login (como no restante do sistema).
export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioDaSessao();
  if (!usuario || !usuario.ativo) redirect("/login");

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <main className="flex-1 overflow-y-auto pb-16">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t bg-card py-2">
        {[
          { href: "/m", icon: Home, label: "Início" },
          { href: "/produtos", icon: Search, label: "Produtos" },
          { href: "/m/scanner", icon: ScanLine, label: "Bipar" },
          { href: "/clientes", icon: Users, label: "Clientes" },
        ].map((it) => {
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className="flex flex-col items-center gap-0.5 px-3 py-1 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="h-5 w-5" />
              {it.label}
            </Link>
          );
        })}
      </nav>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            if ("serviceWorker" in navigator) {
              window.addEventListener("load", () => {
                navigator.serviceWorker.register("/sw.js").catch(() => {});
              });
            }
          `,
        }}
      />
    </div>
  );
}
