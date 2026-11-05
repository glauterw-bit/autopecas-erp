"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Aplicação veicular do produto: lista, adicionar (montadora → modelo →
// versão, posição) e remover. Qualquer mudança tira o selo de "verificada".

export type AplicacaoLinha = {
  id: string;
  titulo: string; // "Mercedes-Benz Sprinter 415 CDI"
  detalhe: string; // "2012–atual · motor OM651 · dianteira"
};

type Opcao = { id: string; nome: string };
type Versao = { id: string; descricao: string; motor: string | null; anoInicio: number | null; anoFim: number | null };

const POSICOES: Array<[string, string]> = [
  ["", "Não se aplica"],
  ["DIANTEIRA", "Dianteira"],
  ["TRASEIRA", "Traseira"],
  ["LADO_DIREITO", "Lado direito"],
  ["LADO_ESQUERDO", "Lado esquerdo"],
  ["DIANTEIRA_DIREITA", "Dianteira direita"],
  ["DIANTEIRA_ESQUERDA", "Dianteira esquerda"],
  ["TRASEIRA_DIREITA", "Traseira direita"],
  ["TRASEIRA_ESQUERDA", "Traseira esquerda"],
  ["SUPERIOR", "Superior"],
  ["INFERIOR", "Inferior"],
  ["CENTRAL", "Central"],
];

const selectCls =
  "mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

async function buscar<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro ?? "Não foi possível carregar a lista.");
  return j as T;
}

export function AplicacoesProduto({
  produtoId,
  aplicacoes,
  podeEditar,
  seloAtivo,
}: {
  produtoId: string;
  aplicacoes: AplicacaoLinha[];
  podeEditar: boolean;
  seloAtivo: boolean;
}) {
  const router = useRouter();
  const base = `/api/produtos/${produtoId}/aplicacoes`;
  const [aberto, setAberto] = useState(false);
  const [montadoras, setMontadoras] = useState<Opcao[] | null>(null);
  const [modelos, setModelos] = useState<Opcao[]>([]);
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [montadoraId, setMontadoraId] = useState("");
  const [modeloId, setModeloId] = useState("");
  const [versaoId, setVersaoId] = useState("");
  const [posicao, setPosicao] = useState("");
  const [qtd, setQtd] = useState("1");
  const [obs, setObs] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const erro = (e: unknown) => setMsg({ tipo: "erro", texto: (e as Error).message });

  useEffect(() => {
    if (!aberto || montadoras) return;
    buscar<Opcao[]>(`${base}/opcoes`).then(setMontadoras).catch(erro);
  }, [aberto, montadoras, base]);

  function escolherMontadora(id: string) {
    setMontadoraId(id);
    setModeloId("");
    setVersaoId("");
    setModelos([]);
    setVersoes([]);
    if (id) buscar<Opcao[]>(`${base}/opcoes?montadoraId=${id}`).then(setModelos).catch(erro);
  }
  function escolherModelo(id: string) {
    setModeloId(id);
    setVersaoId("");
    setVersoes([]);
    if (id) buscar<Versao[]>(`${base}/opcoes?modeloId=${id}`).then(setVersoes).catch(erro);
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!versaoId) {
      setMsg({ tipo: "erro", texto: "Escolha montadora, modelo e versão do veículo." });
      return;
    }
    const q = Number(qtd);
    if (!Number.isInteger(q) || q < 1 || q > 99) {
      setMsg({ tipo: "erro", texto: "Quantidade por veículo deve ser um número de 1 a 99." });
      return;
    }
    setOcupado(true);
    try {
      const r = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versaoId, posicao, quantidadePorVeiculo: q, observacao: obs }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro ?? "Não foi possível adicionar.");
      setMsg({
        tipo: "ok",
        texto: j.seloRemovido
          ? "Aplicação adicionada. O selo de verificada saiu: confira de novo."
          : "Aplicação adicionada.",
      });
      setVersaoId("");
      setPosicao("");
      setObs("");
      router.refresh();
    } catch (err) {
      erro(err);
    } finally {
      setOcupado(false);
    }
  }

  async function remover(a: AplicacaoLinha) {
    if (!window.confirm(`Tirar a aplicação "${a.titulo}" deste produto?`)) return;
    setMsg(null);
    setOcupado(true);
    try {
      const r = await fetch(`${base}/${a.id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro ?? "Não foi possível remover.");
      setMsg({
        tipo: "ok",
        texto: j.seloRemovido ? "Aplicação removida. O selo de verificada saiu." : "Aplicação removida.",
      });
      router.refresh();
    } catch (err) {
      erro(err);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Aplicações ({aplicacoes.length})</CardTitle>
            <p className="text-xs text-muted-foreground">
              Confira veículo, ano, motor, posição e lado antes de dar o selo de verificada. Mudar a lista tira o selo.
            </p>
          </div>
          {podeEditar && (
            <Button size="sm" variant={aberto ? "outline" : "accent"} onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
              <Plus className="h-4 w-4" /> {aberto ? "Fechar" : "Adicionar"}
            </Button>
          )}
        </div>
        {seloAtivo && podeEditar && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Este produto tem o selo de verificada. Se você mudar a aplicação, o selo sai.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3 p-0">
        {aberto && podeEditar && (
          <form onSubmit={adicionar} className="grid grid-cols-1 gap-3 border-y bg-secondary/40 p-4 md:grid-cols-2">
            <div>
              <label htmlFor="ap-montadora" className="text-xs font-medium">Montadora</label>
              <select id="ap-montadora" className={selectCls} value={montadoraId} onChange={(e) => escolherMontadora(e.target.value)} autoFocus>
                <option value="">{montadoras ? "Escolha…" : "Carregando…"}</option>
                {montadoras?.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ap-modelo" className="text-xs font-medium">Modelo</label>
              <select id="ap-modelo" className={selectCls} value={modeloId} onChange={(e) => escolherModelo(e.target.value)} disabled={!montadoraId}>
                <option value="">Escolha…</option>
                {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label htmlFor="ap-versao" className="text-xs font-medium">Versão, ano e motor</label>
              <select id="ap-versao" className={selectCls} value={versaoId} onChange={(e) => setVersaoId(e.target.value)} disabled={!modeloId}>
                <option value="">{modeloId && versoes.length === 0 ? "Nenhuma versão cadastrada para este modelo" : "Escolha…"}</option>
                {versoes.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.descricao} · {v.anoInicio ?? "?"}–{v.anoFim ?? "atual"}
                    {v.motor ? ` · motor ${v.motor}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ap-posicao" className="text-xs font-medium">Posição na montagem</label>
              <select id="ap-posicao" className={selectCls} value={posicao} onChange={(e) => setPosicao(e.target.value)}>
                {POSICOES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ap-qtd" className="text-xs font-medium">Peças por veículo</label>
              <Input id="ap-qtd" inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value)} className="mt-1" />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="ap-obs" className="text-xs font-medium">Observação (opcional)</label>
              <Input id="ap-obs" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={200} placeholder="Ex.: só com ABS" className="mt-1" />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" variant="accent" size="sm" disabled={ocupado || !versaoId}>
                {ocupado ? "Salvando…" : "Adicionar aplicação"}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Não achou o veículo? O catálogo de veículos é compartilhado; avise o suporte para incluir.
              </p>
            </div>
          </form>
        )}
        {msg && (
          <p role={msg.tipo === "erro" ? "alert" : "status"} className={`px-4 text-sm ${msg.tipo === "erro" ? "text-destructive" : "text-emerald-600"}`}>
            {msg.texto}
          </p>
        )}
        <table className="w-full text-sm">
          <tbody>
            {aplicacoes.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-4 py-2">
                  <div className="font-medium">{a.titulo}</div>
                  <div className="text-xs text-muted-foreground">{a.detalhe}</div>
                </td>
                {podeEditar && (
                  <td className="px-2 py-2 text-right">
                    <Button size="icon" variant="ghost" aria-label={`Tirar aplicação ${a.titulo}`} disabled={ocupado} onClick={() => remover(a)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {aplicacoes.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Nenhuma aplicação cadastrada. Sem aplicação, o balcão não acha a peça pelo veículo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
