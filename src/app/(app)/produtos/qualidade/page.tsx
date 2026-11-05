import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { empresaAtualId } from "@/lib/sessao";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { carregarQualidadeCadastro, filtrarPorProblema } from "@/lib/crm/consultas";
import { ROTULO_PROBLEMA, type ProblemaCadastro } from "@/lib/crm/qualidade-cadastro";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FILTROS: Array<ProblemaCadastro | "TODOS"> = [
  "TODOS",
  "REVISAO",
  "SEM_APLICACAO",
  "NAO_VERIFICADO",
  "SEM_NCM",
  "SEM_EAN",
  "EAN_INVALIDO",
  "SEM_CODIGO_FABRICANTE",
  "DUPLICADO",
];

const LIMITE = 300;

export default async function QualidadeCadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ problema?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const filtro = (FILTROS as string[]).includes(sp.problema ?? "") ? sp.problema! : "TODOS";
  const q = sp.q?.trim() ?? "";
  const empresaId = await empresaAtualId();
  const { resumo, linhas } = await carregarQualidadeCadastro(empresaId);
  let lista = filtrarPorProblema(linhas, filtro);
  if (q) {
    const Q = q.toUpperCase();
    lista = lista.filter((l) =>
      [l.sku, l.nome, l.codigoFabricante, l.codigoOem, l.codigoBarras].some((c) => c?.toUpperCase().includes(Q)),
    );
  }
  const href = (p: string) => `/produtos/qualidade?problema=${p}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Qualidade do cadastro</h1>
          <p className="text-muted-foreground">
            Peça errada vira devolução, frete e cliente perdido. Corrija primeiro os itens de curva A.
          </p>
        </div>
        <Link href="/produtos" className="text-sm text-accent underline-offset-2 hover:underline">
          Voltar para produtos
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Aplicação verificada
            </div>
            <div className="text-2xl font-bold">{resumo.pctVerificado}%</div>
            <div className="text-xs text-muted-foreground">
              {resumo.verificados} de {resumo.total} produtos ativos
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Cadastro completo</div>
            <div className="text-2xl font-bold">{resumo.pctCompleto}%</div>
            <div className="text-xs text-muted-foreground">sem nenhum problema</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Marcados para revisão</div>
            <div className="text-2xl font-bold">{resumo.porProblema.REVISAO}</div>
            <div className="text-xs text-muted-foreground">por devolução ou à mão</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Duplicados prováveis</div>
            <div className="text-2xl font-bold">{resumo.porProblema.DUPLICADO}</div>
            <div className="text-xs text-muted-foreground">mesmo EAN ou código do fabricante</div>
          </CardContent>
        </Card>
      </div>

      <nav aria-label="Filtrar por problema" className="flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const ativo = f === filtro;
          const n = f === "TODOS" ? linhas.filter((l) => l.problemas.length).length : resumo.porProblema[f];
          return (
            <Link
              key={f}
              href={href(f)}
              aria-current={ativo ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                ativo ? "border-accent bg-accent text-white" : "hover:bg-secondary"
              }`}
            >
              {f === "TODOS" ? "Com algum problema" : ROTULO_PROBLEMA[f]} <span className="opacity-70">({n})</span>
            </Link>
          );
        })}
      </nav>

      <form className="flex gap-2" action="/produtos/qualidade">
        <input type="hidden" name="problema" value={filtro} />
        <label htmlFor="q-qualidade" className="sr-only">
          Buscar por SKU, nome ou código
        </label>
        <input
          id="q-qualidade"
          name="q"
          defaultValue={q}
          placeholder="Buscar por SKU, nome ou código"
          className="h-9 w-full max-w-sm rounded-md border bg-background px-3 text-sm"
        />
        <button className="h-9 rounded-md border px-3 text-sm hover:bg-secondary">Buscar</button>
      </form>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Produto</th>
                <th className="px-4 py-3 font-medium">Curva</th>
                <th className="px-4 py-3 font-medium">Problemas</th>
                <th className="px-4 py-3 font-medium">Selo</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Ação</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, LIMITE).map((l) => (
                <tr key={l.id} className="border-b align-top hover:bg-secondary/50">
                  <td className="px-4 py-2">
                    <div className="font-medium">{l.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      SKU {l.sku}
                      {l.marca && ` · ${l.marca}`}
                      {l.codigoFabricante && ` · Fab ${l.codigoFabricante}`}
                    </div>
                    {l.revisaoCadastroMotivo && (
                      <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">{l.revisaoCadastroMotivo}</div>
                    )}
                    {l.duplicados.map((d) => (
                      <div key={d.campo} className="mt-1 text-xs text-muted-foreground">
                        {d.campo === "EAN" ? "Mesmo EAN" : "Mesmo código do fabricante"} que{" "}
                        {d.outros.map((o, i) => (
                          <span key={o.id}>
                            {i > 0 && ", "}
                            <Link className="text-accent hover:underline" href={`/produtos/${o.id}`}>
                              {o.sku}
                            </Link>
                          </span>
                        ))}
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={l.curva === "A" ? "accent" : "muted"}>{l.curva}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {l.problemas.map((p) => (
                        <Badge key={p} variant={p === "REVISAO" || p === "DUPLICADO" ? "warning" : "outline"}>
                          {ROTULO_PROBLEMA[p]}
                        </Badge>
                      ))}
                      {l.problemas.length === 0 && <span className="text-xs text-muted-foreground">Nenhum</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {l.aplicacaoVerificadaEm ? (
                      <span className="text-emerald-600">
                        Verificada por {l.aplicacaoVerificadaPorNome ?? "—"} em {formatDate(l.aplicacaoVerificadaEm)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Não verificada</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/produtos/${l.id}`}
                      className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-secondary"
                    >
                      Corrigir
                    </Link>
                  </td>
                </tr>
              ))}
              {lista.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    {resumo.total === 0
                      ? "Nenhum produto ativo cadastrado."
                      : "Nenhum produto com este problema. Bom trabalho."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {lista.length > LIMITE && (
            <p className="border-t px-4 py-3 text-xs text-muted-foreground">
              Mostrando {LIMITE} de {lista.length}. Use a busca ou um filtro para achar o resto.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
