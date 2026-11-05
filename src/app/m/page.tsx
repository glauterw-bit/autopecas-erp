import Link from "next/link";
import { Search, ScanLine, Users } from "lucide-react";

// Só entram aqui telas que existem. Foto com IA, orçamento, histórico, copiloto e perfil
// ainda não existem no app do vendedor externo.
const acoes = [
  { href: "/m/scanner", icon: ScanLine, label: "Bipar peça", cor: "bg-orange-500" },
  { href: "/produtos", icon: Search, label: "Buscar produtos", cor: "bg-emerald-500" },
  { href: "/clientes", icon: Users, label: "Clientes", cor: "bg-blue-500" },
];

export default function MobileHome() {
  return (
    <div className="p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Olá!</h1>
        <p className="text-sm text-muted-foreground">O que vamos fazer agora?</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {acoes.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.href}
              href={a.href}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl bg-card p-4 shadow-sm transition-transform active:scale-95"
            >
              <div className={`${a.cor} flex h-14 w-14 items-center justify-center rounded-2xl text-white`}>
                <Icon className="h-7 w-7" />
              </div>
              <span className="text-sm font-medium">{a.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
