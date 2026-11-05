"use client";

import { useEffect, useRef, useState } from "react";
import { PackageX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// "Não tínhamos" — registra a venda perdida em 2 segundos (F8 no PDV).
// Abre com o texto da busca e o veículo já preenchidos; Enter registra.
// Alt+1..4 troca o motivo sem tirar a mão do teclado. Esc fecha.
// POST /api/vendas-perdidas.

const MOTIVOS = [
  { valor: "SEM_ESTOQUE", label: "Sem estoque", tecla: "1" },
  { valor: "PRECO", label: "Preço", tecla: "2" },
  { valor: "PRAZO_ENTREGA", label: "Prazo", tecla: "3" },
  { valor: "NAO_TRABALHAMOS", label: "Não trabalhamos", tecla: "4" },
] as const;

type Motivo = (typeof MOTIVOS)[number]["valor"];

export function VendaPerdidaModal(props: {
  descricaoInicial: string;
  produtoId?: string | null;
  veiculoInicial?: string | null;
  clienteId?: string | null;
  motivoInicial?: Motivo;
  onClose: () => void;
  onResultado: (mensagem: string, tipo: "ok" | "erro") => void;
}) {
  const { onClose } = props;
  const [descricao, setDescricao] = useState(props.descricaoInicial);
  const [veiculo, setVeiculo] = useState(props.veiculoInicial ?? "");
  const [quantidade, setQuantidade] = useState("1");
  const [motivo, setMotivo] = useState<Motivo>(
    props.motivoInicial ?? (props.produtoId ? "SEM_ESTOQUE" : "NAO_TRABALHAMOS"),
  );
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const descricaoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    descricaoRef.current?.focus();
    descricaoRef.current?.select();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.altKey && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        const m = MOTIVOS.find((x) => x.tecla === e.key);
        if (m) setMotivo(m.valor);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  async function registrar(e?: React.FormEvent) {
    e?.preventDefault();
    if (enviando) return;
    const qtd = Number(quantidade.replace(",", "."));
    if (!descricao.trim()) {
      setErro("Diga qual peça o cliente pediu.");
      descricaoRef.current?.focus();
      return;
    }
    if (!(qtd > 0)) {
      setErro("Quantidade precisa ser maior que zero.");
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
          veiculoDescricao: veiculo.trim() || undefined,
          produtoId: props.produtoId ?? undefined,
          clienteId: props.clienteId ?? undefined,
          quantidade: qtd,
          motivo,
        }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { erro?: string };
        throw new Error(j.erro ?? "Não foi possível registrar. Tente de novo.");
      }
      props.onResultado("Venda perdida registrada. Isso ajuda na próxima compra.", "ok");
      onClose();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vp-titulo"
    >
      <form onSubmit={registrar} className="w-full max-w-md rounded-2xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 id="vp-titulo" className="flex items-center gap-2 text-base font-semibold">
            <PackageX className="h-4 w-4 text-amber-500" /> Não tínhamos
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 hover:bg-secondary"
            aria-label="Fechar (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <div>
            <label htmlFor="vp-peca" className="text-xs text-muted-foreground">
              Peça pedida
            </label>
            <Input
              id="vp-peca"
              ref={descricaoRef}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: pastilha dianteira Sprinter 415"
              maxLength={300}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-[1fr_90px] gap-3">
            <div>
              <label htmlFor="vp-veiculo" className="text-xs text-muted-foreground">
                Veículo (opcional)
              </label>
              <Input
                id="vp-veiculo"
                value={veiculo}
                onChange={(e) => setVeiculo(e.target.value)}
                placeholder="Ex.: Ducato 2.3 2018"
                maxLength={120}
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="vp-qtd" className="text-xs text-muted-foreground">
                Quantidade
              </label>
              <Input
                id="vp-qtd"
                inputMode="decimal"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="mt-1 text-right"
              />
            </div>
          </div>
          <fieldset>
            <legend className="text-xs text-muted-foreground">Motivo (Alt+1 a Alt+4)</legend>
            <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup">
              {MOTIVOS.map((m) => (
                <button
                  key={m.valor}
                  type="button"
                  role="radio"
                  aria-checked={motivo === m.valor}
                  onClick={() => setMotivo(m.valor)}
                  className={`flex items-center justify-between rounded-md border px-3 py-2.5 text-sm font-medium transition-colors ${
                    motivo === m.valor
                      ? "border-accent bg-accent/10 text-foreground ring-1 ring-accent"
                      : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {m.label}
                  <span className="font-mono text-[10px] opacity-70">Alt+{m.tecla}</span>
                </button>
              ))}
            </div>
          </fieldset>
          {erro && (
            <p className="text-xs text-destructive" role="alert">
              {erro}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancelar (Esc)
            </Button>
            <Button type="submit" variant="accent" className="flex-1" disabled={enviando}>
              {enviando ? "Registrando…" : "Registrar (Enter)"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
