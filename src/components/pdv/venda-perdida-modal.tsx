"use client";

import { useState } from "react";
import { PackageX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Mini-modal do PDV para registrar uma venda perdida (demanda não atendida):
// busca sem resultado ou produto sem estoque. POST /api/vendas-perdidas.

const MOTIVOS = [
  { valor: "SEM_ESTOQUE", label: "Sem estoque" },
  { valor: "PRECO", label: "Preço (cliente achou caro)" },
  { valor: "PRAZO_ENTREGA", label: "Prazo de entrega" },
  { valor: "NAO_TRABALHAMOS", label: "Não trabalhamos com o item" },
  { valor: "OUTRO", label: "Outro" },
] as const;

export function VendaPerdidaModal(props: {
  descricaoInicial: string;
  produtoId?: string | null;
  motivoInicial?: (typeof MOTIVOS)[number]["valor"];
  onClose: () => void;
  onResultado: (mensagem: string, tipo: "ok" | "erro") => void;
}) {
  const [descricao, setDescricao] = useState(props.descricaoInicial);
  const [quantidade, setQuantidade] = useState(1);
  const [motivo, setMotivo] = useState<string>(
    props.motivoInicial ?? (props.produtoId ? "SEM_ESTOQUE" : "NAO_TRABALHAMOS"),
  );
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function registrar() {
    if (!descricao.trim() || quantidade <= 0) {
      setErro("Informe a descrição e uma quantidade válida.");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/vendas-perdidas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          descricaoBuscada: descricao.trim(),
          produtoId: props.produtoId ?? undefined,
          quantidade,
          motivo,
        }),
      });
      if (r.status === 404) {
        // endpoint ainda não disponível neste ambiente — não quebra o PDV
        props.onResultado("Registro de venda perdida indisponível no momento.", "erro");
        props.onClose();
        return;
      }
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { erro?: string };
        throw new Error(j.erro ?? "Falha ao registrar venda perdida");
      }
      props.onResultado("Venda perdida registrada.", "ok");
      props.onClose();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <PackageX className="h-4 w-4 text-amber-500" /> Registrar venda perdida
          </h2>
          <button onClick={props.onClose} className="rounded-md p-1 hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <div>
            <label className="text-xs text-muted-foreground">O que o cliente procurava</label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              autoFocus
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-[100px_1fr] gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Quantidade</label>
              <Input
                type="number"
                min={1}
                step="1"
                value={quantidade}
                onChange={(e) => setQuantidade(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 text-right"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Motivo</label>
              <select
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {MOTIVOS.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {erro && <p className="text-xs text-destructive">{erro}</p>}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={props.onClose}>
              Cancelar
            </Button>
            <Button variant="accent" className="flex-1" onClick={registrar} disabled={enviando}>
              {enviando ? "Registrando…" : "Registrar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
