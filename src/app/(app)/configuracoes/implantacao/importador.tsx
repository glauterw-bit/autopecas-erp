"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ENTIDADES, ROTULO_DETALHE, ROTULO_ENTIDADE, type CampoDef, type Entidade, type Mapa } from "@/lib/implantacao/tipos";
import type { Conferencia, ResultadoImportacao } from "@/lib/implantacao/conferencia";

type Previa = {
  cabecalhos: string[];
  separador: string;
  totalLinhas: number;
  campos: CampoDef[];
  mapa: Mapa;
  faltando: string[];
  amostra: { linha: number; dados: Record<string, unknown> | null; erros: string[]; avisos: string[] }[];
  erros: { linha: number; mensagem: string }[];
  conferencia: Conferencia | null;
};
type Resultado = ResultadoImportacao & { totalProblemas: number };

const brl = (c?: number) =>
  c === undefined ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Arquivo do Windows costuma vir em Latin-1: se o UTF-8 der caractere inválido, relê.
async function lerArquivo(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buf);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(buf) : utf8;
}

async function postar<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
  return j as T;
}

export function Importador() {
  const [entidade, setEntidade] = useState<Entidade>("PRODUTO");
  const [arquivo, setArquivo] = useState<{ nome: string; texto: string } | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [mapa, setMapa] = useState<Mapa>({});
  const [deposito, setDeposito] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [simulado, setSimulado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function executar<T>(fn: () => Promise<T>) {
    setOcupado(true);
    setErro(null);
    try {
      return await fn();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function carregar(f: File | undefined, ent = entidade) {
    if (!f) return;
    const texto = await lerArquivo(f);
    setArquivo({ nome: f.name, texto });
    setResultado(null);
    setSimulado(false);
    await executar(async () => {
      const p = await postar<Previa>("/api/implantacao/previa", { entidade: ent, csv: texto });
      setPrevia(p);
      setMapa(p.mapa);
    });
  }

  async function atualizarPrevia(novoMapa: Mapa) {
    if (!arquivo) return;
    setMapa(novoMapa);
    setResultado(null);
    setSimulado(false);
    await executar(async () => {
      setPrevia(await postar<Previa>("/api/implantacao/previa", { entidade, csv: arquivo.texto, mapa: novoMapa }));
    });
  }

  async function rodar(simular: boolean) {
    if (!arquivo) return;
    if (!simular && !confirm(`Gravar ${ROTULO_ENTIDADE[entidade].toLowerCase()} no sistema? Rodar de novo não duplica.`)) return;
    await executar(async () => {
      const r = await postar<Resultado>("/api/implantacao/executar", {
        entidade,
        csv: arquivo.texto,
        mapa,
        simular,
        deposito: deposito || undefined,
        arquivoNome: arquivo.nome,
      });
      setResultado(r);
      if (simular) setSimulado(true);
    });
  }

  const conf = resultado?.conferencia ?? previa?.conferencia ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>1. O que importar</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Cadastro</span>
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={entidade}
              onChange={(e) => {
                const ent = e.target.value as Entidade;
                setEntidade(ent);
                setPrevia(null);
                setResultado(null);
                setArquivo(null);
              }}
            >
              {ENTIDADES.map((e) => (
                <option key={e} value={e}>
                  {ROTULO_ENTIDADE[e]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Arquivo CSV (planilha salva como CSV)</span>
            <input
              key={entidade}
              type="file"
              accept=".csv,.txt,text/csv"
              className="block text-sm"
              onChange={(e) => carregar(e.target.files?.[0])}
            />
          </label>
          {entidade === "ESTOQUE" && (
            <label className="text-sm">
              <span className="mb-1 block font-medium">Depósito para linhas sem depósito</span>
              <input
                className="h-10 rounded-md border bg-background px-3"
                placeholder="Loja"
                value={deposito}
                onChange={(e) => setDeposito(e.target.value)}
              />
            </label>
          )}
        </CardContent>
      </Card>

      {erro && <div className="rounded-md border border-destructive p-3 text-sm text-destructive">{erro}</div>}

      {previa && (
        <Card>
          <CardHeader>
            <CardTitle>
              2. Colunas ({previa.totalLinhas} linhas, separador &quot;{previa.separador}&quot;)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {previa.campos.map((c) => (
              <label key={c.campo} className="text-sm">
                <span className="mb-1 block">
                  {c.rotulo}
                  {c.obrigatorio && <span className="text-destructive"> *</span>}
                </span>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2"
                  value={mapa[c.campo] ?? ""}
                  onChange={(e) => atualizarPrevia({ ...mapa, [c.campo]: e.target.value || null })}
                >
                  <option value="">(não importar)</option>
                  {previa.cabecalhos.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                {c.ajuda && <span className="mt-1 block text-xs text-muted-foreground">{c.ajuda}</span>}
              </label>
            ))}
          </CardContent>
          {previa.faltando.length > 0 && (
            <p className="px-6 pb-4 text-sm text-destructive">Falta escolher: {previa.faltando.join(", ")}</p>
          )}
        </Card>
      )}

      {previa && previa.amostra.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>3. Prévia (primeiras {previa.amostra.length} linhas)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-1">Linha</th>
                  <th className="p-1">Como vai entrar</th>
                  <th className="p-1">Problemas</th>
                </tr>
              </thead>
              <tbody>
                {previa.amostra.map((a) => (
                  <tr key={a.linha} className="border-b align-top">
                    <td className="p-1">{a.linha}</td>
                    <td className="p-1 font-mono">
                      {a.dados
                        ? Object.entries(a.dados)
                            .filter(([, v]) => v !== undefined && v !== null)
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(" · ")
                        : "—"}
                    </td>
                    <td className="p-1">
                      {a.erros.map((e) => (
                        <div key={e} className="text-destructive">
                          {e}
                        </div>
                      ))}
                      {a.avisos.map((e) => (
                        <div key={e} className="text-amber-600">
                          {e}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {previa.erros.length > 0 && (
              <p className="mt-2 text-sm text-destructive">
                {previa.conferencia?.comErro ?? previa.erros.length} linha(s) com erro não entram. Corrija no arquivo ou
                siga sem elas.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {previa && previa.faltando.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>4. Simular e aplicar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={ocupado} onClick={() => rodar(true)}>
                {ocupado ? "Processando…" : "Simular (não grava)"}
              </Button>
              <Button disabled={ocupado || !simulado} onClick={() => rodar(false)} title={simulado ? "" : "Simule primeiro"}>
                Aplicar
              </Button>
              {resultado?.loteId && (
                <Button variant="ghost" asChild>
                  <a href={`/api/implantacao/relatorio?lote=${resultado.loteId}`}>Baixar relatório (CSV)</a>
                </Button>
              )}
            </div>

            {resultado && (
              <div className="space-y-1 text-sm">
                <p className="font-medium">
                  {resultado.simulacao ? "Simulação: nada foi gravado." : `Resultado: ${resultado.status}`}
                </p>
                <p>
                  Criar {resultado.plano.criar} · atualizar {resultado.plano.atualizar} · sem mudança{" "}
                  {resultado.plano.iguais} · bloqueados {resultado.plano.bloqueados} · com erro {resultado.plano.comErro}
                </p>
                {resultado.novosDepositos.length > 0 && <p>Depósitos novos: {resultado.novosDepositos.join(", ")}</p>}
                {resultado.destino && (
                  <p className={resultado.bate ? "text-green-700" : "text-destructive"}>
                    Conferência com o gravado: {resultado.bate ? "bate" : "não bate"}
                    {resultado.diferencas.map((d) => (
                      <span key={d} className="block">
                        {d}
                      </span>
                    ))}
                  </p>
                )}
                {resultado.mensagemErro && <p className="text-destructive">{resultado.mensagemErro}</p>}
                {resultado.totalProblemas > 0 && (
                  <p className="text-muted-foreground">
                    {resultado.totalProblemas} erro(s)/aviso(s) linha a linha no relatório.
                  </p>
                )}
              </div>
            )}

            {conf && (
              <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                <Numero rotulo="Linhas lidas" valor={conf.linhasLidas} />
                <Numero rotulo="Válidas" valor={conf.validas} />
                <Numero rotulo="Com erro" valor={conf.comErro} />
                <Numero rotulo="Com aviso" valor={conf.comAviso} />
                {conf.totais.quantidade !== undefined && <Numero rotulo="Peças em estoque" valor={conf.totais.quantidade} />}
                {conf.totais.valorCustoCentavos !== undefined && (
                  <Numero rotulo="Estoque a custo" valor={brl(conf.totais.valorCustoCentavos)} />
                )}
                {conf.totais.valorAbertoCentavos !== undefined && (
                  <Numero rotulo="A receber em aberto" valor={brl(conf.totais.valorAbertoCentavos)} />
                )}
                {Object.entries(conf.detalhes).map(([k, v]) => (
                  <Numero key={k} rotulo={ROTULO_DETALHE[k] ?? k} valor={v} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string | number }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className="font-semibold">{valor}</div>
    </div>
  );
}
