import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { usuarioDaSessao } from "@/lib/auth/config";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioDaSessao();
  if (!usuario || !usuario.ativo) redirect("/login");

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="mx-auto max-w-7xl p-6">{children}</div>
      </main>
      <CommandPalette />
    </div>
  );
}
