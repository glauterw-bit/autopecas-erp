import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { exigirPerfilPagina } from "@/lib/auth/pagina";
import { prisma } from "@/lib/db";
import { tarefasDaEmpresa } from "@/lib/empresas/onboarding";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmpresaForm } from "./empresa-form";

export const dynamic = "force-dynamic";

// Primeiros passos. Só mostra o que falta; não trava nenhuma tela.
export default async function OnboardingPage() {
  const u = await exigirPerfilPagina("/onboarding", "ADMIN");
  const [tarefas, empresa] = await Promise.all([
    tarefasDaEmpresa(u.empresaId),
    prisma.empresa.findUniqueOrThrow({
      where: { id: u.empresaId },
      select: { inscEstadual: true, regimeTributario: true, cep: true, logradouro: true, numero: true, bairro: true, municipio: true, uf: true },
    }),
  ]);
  const feitas = tarefas.filter((t) => t.feita).length;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bem-vindo! Vamos deixar a loja pronta</h1>
        <p className="text-muted-foreground">
          {feitas} de {tarefas.length} passos feitos. Você pode usar o sistema agora e voltar aqui quando quiser.
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle>O que falta</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {tarefas.map((t) => (
            <div key={t.id} className="flex items-start gap-3">
              {t.feita ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" /> : <Circle className="mt-0.5 h-5 w-5 text-muted-foreground" />}
              <div className="flex-1">
                <div className={t.feita ? "font-medium line-through opacity-60" : "font-medium"}>{t.titulo}</div>
                <p className="text-sm text-muted-foreground">{t.descricao}</p>
              </div>
              {!t.feita && t.link && (
                <Link href={t.link} className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-secondary">Abrir</Link>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Dados da empresa</CardTitle></CardHeader>
        <CardContent><EmpresaForm inicial={empresa} /></CardContent>
      </Card>
      <Link href="/dashboard" className="inline-block text-sm underline">Ir para o painel</Link>
    </div>
  );
}
