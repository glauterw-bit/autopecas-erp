"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, CreditCard, QrCode, Landmark, X, Check, Trash2 } from "lucide-react";
import { formatBRL } from "@/lib/utils";

export type FormaPagamento =
  | "DINHEIRO"
  | "PIX"
  | "DEBITO"
  | "CREDITO"
  | "CREDIARIO";

export interface LinhaPagamento {
  forma: FormaPagamento;
  valor: number;
  parcelas: number;
}

const FORMAS: { id: FormaPagamento; label: string; icon: typeof Banknote; tecla: string }[] = [
  { id: "DINHEIRO", label: "Dinheiro", icon: Banknote, tecla: "1" },
  { id: "PIX", label: "PIX", icon: QrCode, tecla: "2" },
  { id: "DEBITO", label: "Débito", icon: CreditCard, tecla: "3" },
  { id: "CREDITO", label: "Crédito", icon: CreditCard, tecla: "4" },
  { id: "CREDIARIO", label: "Crediário", icon: Landmark, tecla: "5" },
];

export function PaymentModal(props: {
  total: number;
  onCancel: () => void;
  onConfirm: (pagamentos: LinhaPagamento[]) => Promise<void>;
}) {
  const { total } = props;
  const [pagamentos, setPagamentos] = useState<LinhaPagamento[]>([]);
  const [formaAtiva, setFormaAtiva] = useState<FormaPagamento>("DINHEIRO");
  const [valorRecebido, setValorRecebido] = useState("");
  const [parcelas, setParcelas] = useState(1);
  const [processando, setProcessando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pago = useMemo(() => pagamentos.reduce((a, p) => a + p.valor, 0), [pagamentos]);
  const restante = Math.max(0, total - pago);
  const trocoDinheiro = (() => {
    const r = Number(valorRecebido.replace(",", "."));
    if (formaAtiva !== "DINHEIRO" || !r) return 0;
    return Math.max(0, r - restante);
  })();

  useEffect(() => {
    inputRef.current?.focus();
    setValorRecebido(restante.toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formaAtiva]);

  function adicionarPagamento() {
    const recebido = Number(valorRecebido.replace(",", "."));
    if (!recebido || recebido <= 0) return;
    // Para dinheiro, registra apenas o que cobre o restante (resto é troco).
    const valor =
      formaAtiva === "DINHEIRO" ? Math.min(recebido, restante) : recebido;
    setPagamentos((ps) => [...ps, { forma: formaAtiva, valor, parcelas }]);
    setValorRecebido("");
  }

  function removerPagamento(i: number) {
    setPagamentos((ps) => ps.filter((_, idx) => idx !== i));
  }

  async function confirmar() {
    if (pago < total - 0.001) {
      // completa automaticamente com a forma ativa se ainda falta
      const recebido = Number(valorRecebido.replace(",", "."));
      if (recebido > 0) {
        const valor = formaAtiva === "DINHEIRO" ? Math.min(recebido, restante) : restante;
        const lista = [...pagamentos, { forma: formaAtiva, valor, parcelas }];
        setProcessando(true);
        try {
          await props.onConfirm(lista);
        } finally {
          setProcessando(false);
        }
        return;
      }
      return;
    }
    setProcessando(true);
    try {
      await props.onConfirm(pagamentos);
    } finally {
      setProcessando(false);
    }
  }

  // Atalhos: 1-5 trocam forma, Enter adiciona/confirma, ESC cancela
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        props.onCancel();
        return;
      }
      const f = FORMAS.find((x) => x.tecla === e.key);
      if (f && (e.target as HTMLElement).tagName !== "INPUT") {
        setFormaAtiva(f.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quitado = pago >= total - 0.001;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Pagamento</h2>
          <button onClick={props.onCancel} className="rounded-md p-1 hover:bg-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-[1fr_280px]">
          {/* Esquerda: formas e entrada */}
          <div className="border-r p-5">
            <div className="grid grid-cols-5 gap-2">
              {FORMAS.map((f) => {
                const Icon = f.icon;
                const ativo = formaAtiva === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setFormaAtiva(f.id)}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition-colors ${
                      ativo ? "border-accent bg-accent/10 text-accent" : "hover:bg-secondary"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {f.label}
                    <span className="text-[10px] text-muted-foreground">[{f.tecla}]</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5">
              <label className="text-xs text-muted-foreground">
                {formaAtiva === "DINHEIRO" ? "Valor recebido" : "Valor"}
              </label>
              <input
                ref={inputRef}
                inputMode="decimal"
                value={valorRecebido}
                onChange={(e) => setValorRecebido(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (quitado) confirmar();
                    else adicionarPagamento();
                  }
                }}
                className="mt-1 h-14 w-full rounded-lg border bg-background px-4 text-right text-3xl font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
              {formaAtiva === "CREDITO" && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Parcelas:</span>
                  <select
                    value={parcelas}
                    onChange={(e) => setParcelas(Number(e.target.value))}
                    className="h-8 rounded-md border bg-background px-2 text-sm"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}x de {formatBRL((Number(valorRecebido.replace(",", ".")) || 0) / n)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {trocoDinheiro > 0 && (
                <div className="mt-2 flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <span>Troco</span>
                  <span className="text-lg font-bold">{formatBRL(trocoDinheiro)}</span>
                </div>
              )}
              <button
                onClick={adicionarPagamento}
                className="mt-3 h-10 w-full rounded-md border text-sm font-medium hover:bg-secondary"
              >
                + Adicionar pagamento
              </button>
            </div>

            {pagamentos.length > 0 && (
              <div className="mt-4 space-y-1">
                {pagamentos.map((p, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span>
                      {FORMAS.find((f) => f.id === p.forma)?.label}
                      {p.parcelas > 1 ? ` ${p.parcelas}x` : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{formatBRL(p.valor)}</span>
                      <button onClick={() => removerPagamento(i)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Direita: resumo */}
          <div className="flex flex-col bg-secondary/30 p-5">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold">{formatBRL(total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pago</span>
                <span className="font-mono">{formatBRL(pago)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-medium">{quitado ? "Quitado" : "Restante"}</span>
                <span className={`text-xl font-bold ${quitado ? "text-emerald-600" : "text-accent"}`}>
                  {formatBRL(restante)}
                </span>
              </div>
            </div>
            <button
              onClick={confirmar}
              disabled={processando}
              className="mt-auto flex h-14 items-center justify-center gap-2 rounded-lg bg-accent text-base font-semibold text-white disabled:opacity-60"
            >
              {processando ? (
                "Processando..."
              ) : (
                <>
                  <Check className="h-5 w-5" /> Finalizar venda
                </>
              )}
            </button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Enter confirma · ESC cancela · 1-5 troca forma
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
