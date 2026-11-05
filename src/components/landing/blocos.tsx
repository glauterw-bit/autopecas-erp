import Link from "next/link";
import type { ReactNode } from "react";

// Componentes de servidor, sem JavaScript no navegador.

const botao =
  "inline-flex min-h-12 items-center justify-center rounded-md px-6 text-base font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Retorna o link de contato, ou null se nenhuma env estiver definida. */
export function linkContato(): string | null {
  const zap = (process.env.NEXT_PUBLIC_SUPORTE_WHATSAPP ?? "").replace(/\D/g, "");
  if (zap) return `https://wa.me/${zap}`;
  const email = (process.env.NEXT_PUBLIC_SUPORTE_EMAIL ?? "").trim();
  if (email) return `mailto:${email}`;
  return null;
}

export function Botoes({ contato }: { contato: string | null }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Link href="/cadastro" className={`${botao} bg-primary text-primary-foreground hover:opacity-90`}>
        Testar grátis por 14 dias
      </Link>
      {contato && (
        <a href={contato} className={`${botao} border border-foreground/40 hover:bg-secondary`}>
          Falar com a gente
        </a>
      )}
    </div>
  );
}

export function Secao({
  id,
  titulo,
  intro,
  children,
  fundo,
}: {
  id: string;
  titulo: string;
  intro?: string;
  children: ReactNode;
  fundo?: boolean;
}) {
  return (
    <section id={id} className={fundo ? "border-t bg-card" : "border-t"} aria-labelledby={`${id}-t`}>
      <div className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
        <h2 id={`${id}-t`} className="text-2xl font-bold tracking-tight sm:text-3xl">
          {titulo}
        </h2>
        {intro && <p className="mt-3 max-w-3xl text-base text-muted-foreground sm:text-lg">{intro}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

// Cores com contraste AA nos dois temas (texto escuro sobre fundo claro e o inverso).
const corStatus = {
  Beta: "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100",
  "Em desenvolvimento": "bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-50",
} as const;

export function Selo({ status }: { status: keyof typeof corStatus }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${corStatus[status]}`}>
      {status}
    </span>
  );
}
