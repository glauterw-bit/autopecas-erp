"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL, formatDateTime } from "@/lib/utils";

// Devolução de venda com motivo obrigatório (F7 no PDV).
// Teclado: número da venda + Enter → ajuste as quantidades → Alt+1..4 escolhe
// o motivo → F9 confirma. Esc volta ao PDV.

const MOTIVOS = [
  { valor: "ERRO_CADASTRO", label: "Peça errada por cadastro", dica: "O sistema indicou a peça errada. O produto vai para revisão.", tecla: "1" },
  { valor: "ERRO_BALCAO", label: "Peça errada no balcão", dica: "O cadastro estava certo; a escolha no balcão errou.", tecla: "2" },
  { valor: "GARANTIA_DEFEITO", label: "Garantia / defeito", dica: "Não volta para o estoque de venda.", tecla: "3" },
  { valor: "DESISTENCIA", label: "Desistência", dica: "Cliente não quis mais. Volta para o estoque.", tecla: "4" },
] as const;

type Motivo = (typeof MOTIVOS)[number]["valor"];

interface VendaCarregada {
  id: string;
  numero: number;
  status: string;
  criadaEm: string;
  cliente: { id: string; nome: string } | null;
  podeDevolver: boolean;
  itens: Array<{
    id: string;
    produto: { id: string; sku: string; nome: string };
    quantidade: number;
    precoUnitario: number;
    jaDevolvido: number;
  }>;
}

export function DevolucaoClient() {
  const [numero, setNumero] = useState("");
  const [venda, setVenda] = useState<VendaCarregada | null>(null);
  const [qtds, setQtds] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState<Motivo | null>(null);
  const [observacao, setObservacao] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ aviso: string; revisao: boolean; voltaEstoque: boolean } | null>(null);
  const numeroRef = useRef<HTMLInputElement>(null);

  useEffect(() => numeroRef.current?.focus(), []);

  async function carregar(e?: React.FormEvent) {
    e?.preventDefault();
    if (!numero.trim()) return;
    setCarregando(true);
    setErro(null);
    setVenda(null);
    setFeito(null);
    try {
      const r = await fetch(`/api/vendas/devolucao?numero=${encodeURIComponent(numero.trim())}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Não foi possível carregar a venda.");
      const v = j as VendaCarregada;
      setVenda(v);
      setQtds(Object.fromEntries(v.itens.map((i) => [i.id, String(Math.max(0, i.quantidade - i.jaDevolvido))])));
      setMotivo(null);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  const confirmar = useCallback(async () => {
    if (!venda || enviando) return;
    if (!motivo) {
      setErro("Escolha o motivo do retorno (Alt+1 a Alt+4).");
      return;
    }
    const itens = venda.itens
      .map((i) => ({ itemVendaId: i.id, quantidade: Number((qtds[i.id] ?? "0").replace(",", ".")) }))
      .filter((i) => i.quantidade > 0);
    if (itens.length === 0) {
      setErro("Informe a quantidade de pelo menos um item.");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/vendas/devolucao", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vendaId: venda.id, motivo, itens, observacao: observacao.trim() || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Não foi possível registrar o retorno.");
      setFeito({ aviso: j.aviso, revisao: j.produtoMarcadoRevisao, voltaEstoque: j.voltaEstoque });
      setVenda(null);
      setNumero("");
      setTimeout(() => numeroRef.current?.focus(), 0);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }, [venda, enviando, motivo, qtds, observacao]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey && /^[1-4]$/.test(e.key) && venda) {
        e.preventDefault();
        const m = MOTIVOS.find((x) => x.tecla === e.key);
        if (m) setMotivo(m.valor);
      } else if (e.key === "F9" && venda) {
        e.preventDefault();
        confirmar();
      } else if (e.key === "Escape") {
        e.preventDefault();
        window.location.href = "/pdv";
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [venda, confirmar]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <RotateCcw className="h-5 w-5" /> Devolução de venda
          </h1>
          <p className="text-sm text-muted-foreground">
            Motivo obrigatório. Peça errada por cadastro manda o produto para revisão.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/pdv">
            <ArrowLeft className="h-4 w-4" /> PDV (Esc)
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={carregar} className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="dev-numero" className="text-xs text-muted-foreground">
                Número da venda
              </label>
              <Input
                id="dev-numero"
                ref={numeroRef}
                inputMode="numeric"
                value={numero}
                onChange={(e) => setNumero(e.target.value.replace(/\D/g, ""))}
                placeholder="Ex.: 1234"
                className="mt-1 h-11 text-base"
              />
            </div>
            <Button type="submit" className="h-11" disabled={carregando || !numero}>
              <Search className="h-4 w-4" /> {carregando ? "Buscando…" : "Buscar (Enter)"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {erro && (
        <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {erro}
        </div>
      )}

      {feito && (
        <div role="status" className="flex items-start gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
          <div>
            <div className="font-semibold">Retorno registrado.</div>
            <div>{feito.voltaEstoque ? "A peça voltou para o estoque." : "A peça NÃO voltou para o estoque de venda (garantia/defeito)."}</div>
            {feito.revisao && <div>O produto foi marcado para revisão de cadastro.</div>}
            <div className="text-muted-foreground">{feito.aviso}</div>
          </div>
        </div>
      )}

      {venda && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Venda #{venda.numero} · {formatDateTime(venda.criadaEm)}
              {venda.cliente && <span className="font-normal text-muted-foreground"> · {venda.cliente.nome}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!venda.podeDevolver && (
              <div className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                Esta venda não está concluída (situação: {venda.status.toLowerCase()}). Só dá para devolver venda concluída.
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">Peça</th>
                  <th className="py-2 text-right font-medium">Vendido</th>
                  <th className="py-2 text-right font-medium">Já voltou</th>
                  <th className="py-2 text-right font-medium">Devolver agora</th>
                </tr>
              </thead>
              <tbody>
                {venda.itens.map((i) => {
                  const saldo = i.quantidade - i.jaDevolvido;
                  return (
                    <tr key={i.id} className="border-b">
                      <td className="py-2">
                        <div className="font-medium">{i.produto.nome}</div>
                        <div className="text-xs text-muted-foreground">
                          SKU {i.produto.sku} · {formatBRL(i.precoUnitario)} un
                        </div>
                      </td>
                      <td className="py-2 text-right font-mono">{i.quantidade}</td>
                      <td className="py-2 text-right font-mono">{i.jaDevolvido}</td>
                      <td className="py-2 text-right">
                        <label className="sr-only" htmlFor={`dev-q-${i.id}`}>
                          Quantidade a devolver de {i.produto.nome}
                        </label>
                        <input
                          id={`dev-q-${i.id}`}
                          inputMode="decimal"
                          disabled={saldo <= 0 || !venda.podeDevolver}
                          value={qtds[i.id] ?? "0"}
                          onChange={(e) => setQtds((q) => ({ ...q, [i.id]: e.target.value }))}
                          onFocus={(e) => e.target.select()}
                          className="h-9 w-20 rounded-md border bg-background px-2 text-right font-mono disabled:opacity-50"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <fieldset disabled={!venda.podeDevolver}>
              <legend className="text-sm font-medium">
                Motivo do retorno <span className="text-destructive">*</span>{" "}
                <span className="text-xs font-normal text-muted-foreground">(Alt+1 a Alt+4)</span>
              </legend>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup">
                {MOTIVOS.map((m) => (
                  <button
                    key={m.valor}
                    type="button"
                    role="radio"
                    aria-checked={motivo === m.valor}
                    onClick={() => setMotivo(m.valor)}
                    className={`rounded-md border p-3 text-left transition-colors ${
                      motivo === m.valor ? "border-accent bg-accent/10 ring-1 ring-accent" : "hover:bg-secondary"
                    }`}
                  >
                    <div className="flex items-center justify-between text-sm font-medium">
                      {m.label} <span className="font-mono text-[10px] opacity-70">Alt+{m.tecla}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{m.dica}</div>
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="dev-obs" className="text-xs text-muted-foreground">
                O que aconteceu (opcional)
              </label>
              <Input
                id="dev-obs"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                maxLength={500}
                placeholder="Ex.: cadastro diz Ducato 2.3 2018, mas a peça é do motor 2.8"
                className="mt-1"
              />
            </div>

            <Button
              variant="accent"
              className="h-12 w-full text-base"
              onClick={confirmar}
              disabled={enviando || !venda.podeDevolver}
            >
              {enviando ? "Registrando…" : "Confirmar devolução (F9)"}
            </Button>
          </CardContent>
        </Card>
      )}

      {!venda && !feito && !erro && !carregando && (
        <p className="text-center text-sm text-muted-foreground">
          Digite o número da venda que está no cupom e aperte Enter.
        </p>
      )}
    </div>
  );
}
