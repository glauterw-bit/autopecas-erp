import Link from "next/link";
import { Botoes, Secao, Selo, linkContato } from "@/components/landing/blocos";
import { BETA, CONTRATO, DORES, FAQ, FISCAL, MIGRACAO, NOME_PRODUTO } from "@/components/landing/conteudo";

// Página pública de vendas. Server component, sem estado nem JS no cliente.
// Texto em src/components/landing/conteudo.ts.

export default function Home() {
  const contato = linkContato();
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4">
          <span className="text-lg font-bold">{NOME_PRODUTO}</span>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-5 py-12 sm:py-20" aria-labelledby="topo-t">
          <h1 id="topo-t" className="max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">
            Achar a peça certa rápido. Nota que sai certa. Estoque que bate. Nenhum cliente esquecido.
          </h1>
          <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Sistema de gestão para loja de autopeças: balcão, estoque, compras, fiscal e financeiro num lugar só. Vender
            mais e errar menos.
          </p>
          <div className="mt-8">
            <Botoes contato={contato} />
          </div>
          <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
            O sistema está em fase de piloto: nenhuma loja opera nele ainda. Abaixo, o que já funciona e o que ainda não.
          </p>
        </section>

        <Secao
          id="dores"
          titulo="Os problemas do balcão e como o sistema ajuda"
          intro="Só o que já funciona hoje."
          fundo
        >
          <ul className="grid gap-4 sm:grid-cols-2">
            {DORES.map((d) => (
              <li key={d.titulo} className="rounded-lg border bg-background p-5">
                <h3 className="text-lg font-semibold">{d.titulo}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{d.problema}</p>
                <p className="mt-3 text-sm">{d.solucao}</p>
              </li>
            ))}
          </ul>
        </Secao>

        <Secao
          id="fiscal"
          titulo="Fiscal em São Paulo, 2026"
          intro="A regra mudou este ano. Na dúvida fiscal, o sistema bloqueia a nota e explica o motivo, em vez de deixar passar. Nota errada vira multa para a loja."
        >
          <ul className="grid gap-4 md:grid-cols-3">
            {FISCAL.map((f) => (
              <li key={f.titulo} className="rounded-lg border p-5">
                <h3 className="text-lg font-semibold">{f.titulo}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.texto}</p>
              </li>
            ))}
          </ul>
        </Secao>

        <Secao
          id="migracao"
          titulo="Trocar de sistema sem parar a loja"
          intro="Você só passa a usar de verdade depois de conferir os dados. A implantação é acompanhada, e as condições são combinadas na conversa."
          fundo
        >
          <ul className="grid gap-3 sm:grid-cols-2">
            {MIGRACAO.map((m) => (
              <li key={m} className="rounded-lg border bg-background p-4 text-sm">
                {m}
              </li>
            ))}
          </ul>
        </Secao>

        <Secao
          id="beta"
          titulo="O que está em teste e o que ainda não existe"
          intro="Preferimos dizer antes do que você descobrir depois."
        >
          <ul className="grid gap-4 sm:grid-cols-2">
            {BETA.map((b) => (
              <li key={b.titulo} className="rounded-lg border p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold">{b.titulo}</h3>
                  <Selo status={b.status} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{b.texto}</p>
              </li>
            ))}
          </ul>
        </Secao>

        <Secao id="contrato" titulo="Contrato sem pegadinha" fundo>
          <ul className="max-w-3xl space-y-3 text-base">
            <li className="rounded-lg border bg-background p-4">{CONTRATO.teste}</li>
            <li className="rounded-lg border bg-background p-4">{CONTRATO.exportacao}</li>
            <li className="rounded-lg border bg-background p-4">{CONTRATO.atraso}</li>
            <li className="rounded-lg border bg-background p-4">{CONTRATO.preco}</li>
          </ul>
        </Secao>

        <Secao id="perguntas" titulo="Perguntas frequentes">
          <div className="max-w-3xl divide-y rounded-lg border">
            {FAQ.map((f) => (
              <details key={f.p} className="group p-4">
                <summary className="flex min-h-11 cursor-pointer items-center font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {f.p}
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{f.r}</p>
              </details>
            ))}
          </div>
        </Secao>

        <section className="border-t bg-card">
          <div className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
            <h2 className="text-2xl font-bold sm:text-3xl">Quer ver na sua loja?</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Teste por 14 dias com os dados da sua loja.
            </p>
            <div className="mt-6">
              <Botoes contato={contato} />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <nav
          aria-label="Rodapé"
          className="mx-auto flex max-w-5xl flex-wrap gap-x-6 gap-y-1 px-5 py-8 text-sm"
        >
          {[
            ["/termos", "Termos de uso"],
            ["/privacidade", "Privacidade"],
            ["/dpa", "Contrato de dados (DPA)"],
            ["/login", "Entrar"],
            ["/cadastro", "Testar grátis"],
          ].map(([href, rotulo]) => (
            <Link
              key={href}
              href={href}
              className="inline-flex min-h-11 items-center underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {rotulo}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
