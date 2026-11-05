import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { usuarioDaSessao } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { BannerAssinatura } from "@/components/layout/banner-assinatura";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioDaSessao();
  if (!usuario || !usuario.ativo) redirect("/login");
  const empresa = await prisma.empresa.findUnique({
    where: { id: usuario.empresaId },
    select: { nomeFantasia: true, razaoSocial: true },
  });

  return (
    <div className="flex h-screen">
      <Sidebar
        perfil={usuario.perfil}
        nomeUsuario={usuario.nome}
        nomeEmpresa={empresa?.nomeFantasia || empresa?.razaoSocial || "Minha empresa"}
      />
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="mx-auto max-w-7xl p-6">
          <BannerAssinatura empresaId={usuario.empresaId} admin={usuario.perfil === "ADMIN"} />
          {children}
        </div>
      </main>
      <CommandPalette />
    </div>
  );
}
