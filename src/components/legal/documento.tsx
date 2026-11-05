import Link from "next/link";
import type { ReactNode } from "react";
import { TERMOS_VERSAO } from "@/lib/legal/versao";

/** Marcação bem visível para o que o dono do SaaS ainda precisa preencher. */
export function Preencher({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded bg-yellow-200 px-1 font-semibold text-black">[PREENCHER: {children}]</mark>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="mt-8 text-xl font-semibold">{children}</h2>;
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mt-3 leading-relaxed">{children}</p>;
}

export function Lista({ children }: { children: ReactNode }) {
  return <ul className="mt-3 list-disc space-y-1 pl-6 leading-relaxed">{children}</ul>;
}

export function DocumentoLegal({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-[15px]">
      <div
        role="note"
        className="mb-6 rounded-lg border-2 border-yellow-500 bg-yellow-50 p-4 text-sm text-black"
      >
        <strong>RASCUNHO para revisão de advogado.</strong> Este texto ainda não foi revisado por um
        profissional do direito e pode mudar. Os trechos em amarelo [PREENCHER] são dados que o
        responsável pelo serviço precisa completar antes da publicação.
      </div>
      <h1 className="text-3xl font-bold">{titulo}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Versão {TERMOS_VERSAO} · Vigência a partir de 05/11/2026 · Última atualização: 05/11/2026
      </p>
      {children}
      <nav className="mt-10 flex flex-wrap gap-4 border-t pt-4 text-sm">
        <Link href="/termos" className="underline">Termos de uso</Link>
        <Link href="/privacidade" className="underline">Política de privacidade</Link>
        <Link href="/dpa" className="underline">Contrato de operador de dados (DPA)</Link>
      </nav>
    </main>
  );
}
