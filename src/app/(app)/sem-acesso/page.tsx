import Link from "next/link";
import { ShieldAlert, Lock } from "lucide-react";
import { usuarioDaSessao } from "@/lib/auth/config";
import { NOME_MODULO, type Modulo } from "@/lib/assinatura/estado";

export default async function SemAcessoPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string; modulo?: string }>;
}) {
  const { motivo, modulo } = await searchParams;
  if (motivo === "plano" && modulo && modulo in NOME_MODULO) {
    const u = await usuarioDaSessao();
    const admin = u?.perfil === "ADMIN";
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border bg-card p-8 text-center">
        <Lock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <h1 className="text-xl font-bold">{NOME_MODULO[modulo as Modulo]} não está no seu plano</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta área faz parte de um plano maior. Seus dados e o resto do sistema continuam normais.
          {admin ? "" : " Peça a quem administra a loja para mudar de plano."}
        </p>
        {admin && (
          <Link
            href="/configuracoes/assinatura"
            className="mt-5 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Mudar de plano
          </Link>
        )}
      </div>
    );
  }
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border bg-card p-8 text-center">
      <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <h1 className="text-xl font-bold">Sem acesso a esta tela</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        O seu perfil não abre esta área. Se precisa dela, peça ao administrador da loja para mudar o seu perfil.
      </p>
      <Link href="/dashboard" className="mt-5 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white">
        Voltar ao início
      </Link>
    </div>
  );
}
