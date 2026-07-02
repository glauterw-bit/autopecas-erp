"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftRight, ArrowDownToLine, ArrowUpFromLine, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";

// Transferência entre depósitos: busca o produto por SKU/nome via
// GET /api/produtos?q=, escolhe origem/destino e envia para
// POST /api/estoque/transferencias. Lista as últimas 50 movimentações.

type Deposito = { id: string; nome: string; tipo: string };

type ProdutoBusca = {
  id: string;
  sku: string;
  nome: string;
  estoques?: { depositoId: string; quantidade: string; reservado: string }[];
};

type Movimento = {
  id: string;
  tipo: "TRANSFERENCIA_ENTRADA" | "TRANSFERENCIA_SAIDA";
  quantidade: string;
  documento: string | null;
  criadoEm: string;
  produto: { id: string; sku: string; nome: string };
  deposito: { id: string; nome: string };
};

const selectClasses =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function TransferenciaCard({ depositos }: { depositos: Deposito[] }) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<ProdutoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [produto, setProduto] = useState<ProdutoBusca | null>(null);
  const [origemId, setOrigemId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregarMovimentos = useCallback(async () => {
    try {
      const res = await fetch("/api/estoque/transferencias");
      const json = await res.json();
      if (res.ok) setMovimentos(json);
    } catch {
      // lista é informativa; erro de rede não bloqueia o form
    }
  }, []);

  useEffect(() => {
    void carregarMovimentos();
  }, [carregarMovimentos]);

  function aoDigitarBusca(valor: string) {
    setBusca(valor);
    setProduto(null);
    if (debounce.current) clearTimeout(debounce.current);
    const q = valor.trim();
    if (q.length < 2) {
      setResultados([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await fetch(`/api/produtos?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (res.ok) setResultados((json as ProdutoBusca[]).slice(0, 8));
      } finally {
        setBuscando(false);
      }
    }, 300);
  }

  function selecionarProduto(p: ProdutoBusca) {
    setProduto(p);
    setBusca(`${p.sku} — ${p.nome}`);
    setResultados([]);
  }

  function saldoNoDeposito(depositoId: string): string | null {
    const e = produto?.estoques?.find((x) => x.depositoId === depositoId);
    if (!e) return null;
    return `${Number(e.quantidade)} (reservado ${Number(e.reservado)})`;
  }

  async function transferir() {
    setErro(null);
    setSucesso(null);
    if (!produto) return setErro("Selecione um produto pela busca");
    if (!origemId || !destinoId) return setErro("Escolha os depósitos de origem e destino");
    const qtd = Number(quantidade);
    if (!qtd || qtd <= 0) return setErro("Quantidade deve ser maior que zero");

    setEnviando(true);
    try {
      const res = await fetch("/api/estoque/transferencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produtoId: produto.id,
          origemDepositoId: origemId,
          destinoDepositoId: destinoId,
          quantidade: qtd,
          observacao: observacao.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro ?? "Falha na transferência");
      setSucesso(`Transferido ${qtd} × ${json.produto.sku} de ${json.origem} para ${json.destino}`);
      setQuantidade("");
      setObservacao("");
      setProduto(null);
      setBusca("");
      void carregarMovimentos();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4" /> Transferência entre depósitos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="relative md:col-span-2">
            <label className="mb-1 block text-xs text-muted-foreground">
              Produto (busque por SKU, nome ou código)
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={busca}
                onChange={(e) => aoDigitarBusca(e.target.value)}
                placeholder="Ex.: PAST-001 ou pastilha de freio"
              />
            </div>
            {buscando && (
              <p className="mt-1 text-xs text-muted-foreground">Buscando…</p>
            )}
            {resultados.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-background shadow-md">
                {resultados.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => selecionarProduto(p)}
                  >
                    <span className="truncate">{p.nome}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{p.sku}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Depósito de origem</label>
            <select className={selectClasses} value={origemId} onChange={(e) => setOrigemId(e.target.value)}>
              <option value="">Selecione…</option>
              {depositos.map((d) => (
                <option key={d.id} value={d.id}>{d.nome}</option>
              ))}
            </select>
            {produto && origemId && (
              <p className="mt-1 text-xs text-muted-foreground">
                Saldo: {saldoNoDeposito(origemId) ?? "sem estoque neste depósito"}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Depósito de destino</label>
            <select className={selectClasses} value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
              <option value="">Selecione…</option>
              {depositos
                .filter((d) => d.id !== origemId)
                .map((d) => (
                  <option key={d.id} value={d.id}>{d.nome}</option>
                ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Quantidade</label>
            <Input
              type="number"
              min="0.001"
              step="any"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              placeholder="0"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Observação (opcional)</label>
            <Input
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Motivo da transferência"
            />
          </div>
        </div>

        {erro && <p className="text-sm text-red-500">{erro}</p>}
        {sucesso && <p className="text-sm text-emerald-600">{sucesso}</p>}

        <Button onClick={transferir} disabled={enviando}>
          <ArrowLeftRight className="mr-2 h-4 w-4" />
          {enviando ? "Transferindo…" : "Transferir"}
        </Button>

        <div>
          <h3 className="mb-2 text-sm font-medium">Últimas transferências</h3>
          {movimentos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma transferência registrada.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Data</th>
                    <th className="p-2">Produto</th>
                    <th className="p-2">Depósito</th>
                    <th className="p-2">Movimento</th>
                    <th className="p-2 text-right">Qtd</th>
                  </tr>
                </thead>
                <tbody>
                  {movimentos.map((m) => (
                    <tr key={m.id} className="border-t">
                      <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(m.criadoEm)}
                      </td>
                      <td className="p-2">
                        <span className="font-mono text-xs">{m.produto.sku}</span>{" "}
                        <span className="text-muted-foreground">{m.produto.nome}</span>
                      </td>
                      <td className="p-2">{m.deposito.nome}</td>
                      <td className="p-2">
                        {m.tipo === "TRANSFERENCIA_SAIDA" ? (
                          <Badge variant="warning">
                            <ArrowUpFromLine className="mr-1 h-3 w-3" /> saída
                          </Badge>
                        ) : (
                          <Badge variant="success">
                            <ArrowDownToLine className="mr-1 h-3 w-3" /> entrada
                          </Badge>
                        )}
                      </td>
                      <td className="p-2 text-right font-medium">{Number(m.quantidade)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
