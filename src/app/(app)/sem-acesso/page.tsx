import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function SemAcessoPage() {
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
