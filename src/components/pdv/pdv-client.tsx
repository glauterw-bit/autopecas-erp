"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Camera, Car, Minus, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/utils";

interface Produto {
  id: string;
  sku: string;
  nome: string;
  marca: string | null;
  precoVenda: number;
  precoPromocional: number | null;
  estoque: number;
  fotoPrincipal: string | null;
  matchTipo: "EXATO" | "APLICACAO" | "TEXTO";
}

interface ItemCarrinho {
  produtoId: string;
  sku: string;
  nome: string;
  quantidade: number;
  precoUnitario: number;
  custoUnitario?: number;
  desconto: number;
}

const TECLAS = [
  { tecla: "F2", acao: "Cliente" },
  { tecla: "F3", acao: "Placa" },
  { tecla: "F4", acao: "Foto IA" },
  { tecla: "F5", acao: "Limpar" },
  { tecla: "F8", acao: "Desconto" },
  { tecla: "F9", acao: "Finalizar" },
];

export function PdvClient() {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<Produto[]>([]);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [placa, setPlaca] = useState("");
  const [veiculoDescricao, setVeiculoDescricao] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [finalizando, setFinalizando] = useState(false);
  const buscaRef = useRef<HTMLInputElement>(null);

  // Foco automático na busca.
  useEffect(() => {
    buscaRef.current?.focus();
  }, []);

  // Atalhos de teclado padrão de PDV.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F9") {
        e.preventDefault();
        finalizar();
      } else if (e.key === "F5") {
        e.preventDefault();
        setCarrinho([]);
        setVeiculoDescricao(null);
      } else if (e.key === "F3") {
        e.preventDefault();
        const p = prompt("Placa do veículo:");
        if (p) consultarPlaca(p);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrinho]);

  // Busca com debounce.
  useEffect(() => {
    if (!termo) {
      setResultados([]);
      return;
    }
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetch(`/api/produtos/buscar-pdv?q=${encodeURIComponent(termo)}`);
        setResultados((await r.json()) as Produto[]);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setBuscando(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [termo]);

  const consultarPlaca = useCallback(async (p: string) => {
    setPlaca(p);
    const r = await fetch(`/api/veiculos/buscar-placa?placa=${encodeURIComponent(p)}`);
    const json = (await r.json()) as { encontrado?: boolean; dados?: { marca?: string; modelo?: string; anoModelo?: number } };
    if (json.encontrado && json.dados) {
      setVeiculoDescricao(
        `${json.dados.marca ?? ""} ${json.dados.modelo ?? ""} ${json.dados.anoModelo ?? ""}`.trim(),
      );
    }
  }, []);

  const adicionar = (p: Produto) => {
    setCarrinho((cs) => {
      const existente = cs.find((c) => c.produtoId === p.id);
      if (existente) {
        return cs.map((c) =>
          c.produtoId === p.id ? { ...c, quantidade: c.quantidade + 1 } : c,
        );
      }
      return [
        ...cs,
        {
          produtoId: p.id,
          sku: p.sku,
          nome: p.nome,
          quantidade: 1,
          precoUnitario: p.precoPromocional ?? p.precoVenda,
          desconto: 0,
        },
      ];
    });
    setTermo("");
    setResultados([]);
    buscaRef.current?.focus();
  };

  const alterarQtd = (i: number, delta: number) => {
    setCarrinho((cs) =>
      cs
        .map((c, idx) => (idx === i ? { ...c, quantidade: Math.max(0, c.quantidade + delta) } : c))
        .filter((c) => c.quantidade > 0),
    );
  };

  const removerItem = (i: number) => setCarrinho((cs) => cs.filter((_, idx) => idx !== i));

  const subtotal = useMemo(
    () => carrinho.reduce((a, c) => a + c.precoUnitario * c.quantidade - c.desconto, 0),
    [carrinho],
  );

  async function finalizar() {
    if (carrinho.length === 0) return;
    setFinalizando(true);
    setErro(null);
    try {
      const r = await fetch("/api/vendas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tipo: "VENDA",
          origem: "PDV",
          veiculoPlaca: placa || null,
          itens: carrinho.map((c) => ({
            produtoId: c.produtoId,
            quantidade: c.quantidade,
            precoUnitario: c.precoUnitario,
            desconto: c.desconto,
          })),
          pagamentos: [
            { formaPagamento: "DINHEIRO", valor: subtotal, parcelas: 1 },
          ],
        }),
      });
      if (!r.ok) throw new Error("Falha ao registrar venda");
      const venda = (await r.json()) as { numero: number; id: string };
      alert(`Venda #${venda.numero} registrada. Finalize a forma de pagamento na próxima etapa.`);
      setCarrinho([]);
      setVeiculoDescricao(null);
      setPlaca("");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setFinalizando(false);
    }
  }

  return (
    <div className="grid h-[calc(100vh-3rem)] grid-cols-[1fr_400px] gap-4">
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-muted-foreground" />
              <Input
                ref={buscaRef}
                placeholder="Bipe o código de barras, busque por SKU, OEM, fabricante ou nome..."
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                className="h-12 border-0 text-base shadow-none focus-visible:ring-0"
              />
              <Button variant="outline" size="icon" title="Identificar peça por foto (AutoVision)">
                <Camera className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                title="Buscar por placa"
                onClick={() => {
                  const p = prompt("Placa:");
                  if (p) consultarPlaca(p);
                }}
              >
                <Car className="h-4 w-4" />
              </Button>
            </div>
            {veiculoDescricao && (
              <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Car className="h-3 w-3" /> Veículo: <strong>{veiculoDescricao}</strong> ({placa})
                <button
                  className="ml-auto text-xs text-destructive hover:underline"
                  onClick={() => {
                    setVeiculoDescricao(null);
                    setPlaca("");
                  }}
                >
                  remover
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex-1 overflow-hidden">
          <CardContent className="h-full overflow-auto p-2">
            {buscando && (
              <div className="p-6 text-center text-sm text-muted-foreground">Buscando...</div>
            )}
            {!buscando && resultados.length === 0 && termo && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Nada encontrado para &quot;{termo}&quot;. Tente SmartCross para achar equivalente.
              </div>
            )}
            {resultados.map((p) => (
              <button
                key={p.id}
                onClick={() => adicionar(p)}
                className="flex w-full items-center gap-3 rounded-md p-3 text-left transition-colors hover:bg-secondary"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                  {p.sku}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{p.nome}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {p.marca && <Badge variant="muted">{p.marca}</Badge>}
                    <span>Estoque: {p.estoque}</span>
                    {p.matchTipo === "EXATO" && <Badge variant="success">match exato</Badge>}
                    {p.matchTipo === "APLICACAO" && <Badge variant="accent">aplicação</Badge>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-semibold">
                    {formatBRL(p.precoPromocional ?? p.precoVenda)}
                  </div>
                  {p.precoPromocional && (
                    <div className="text-xs text-muted-foreground line-through">
                      {formatBRL(p.precoVenda)}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {TECLAS.map((t) => (
            <div key={t.tecla} className="rounded-md border bg-card px-2 py-1">
              <span className="font-mono font-semibold">{t.tecla}</span> {t.acao}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Card className="flex-1 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm">Carrinho ({carrinho.length})</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCarrinho([])}
              disabled={carrinho.length === 0}
            >
              <X className="h-3 w-3" /> Limpar
            </Button>
          </CardHeader>
          <CardContent className="h-full space-y-2 overflow-auto p-3">
            {carrinho.length === 0 && (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Bipe ou busque uma peça para começar.
              </div>
            )}
            {carrinho.map((c, i) => (
              <div key={`${c.produtoId}-${i}`} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{c.nome}</div>
                    <div className="text-xs text-muted-foreground">SKU {c.sku}</div>
                  </div>
                  <button
                    onClick={() => removerItem(i)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button size="icon" variant="outline" onClick={() => alterarQtd(i, -1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="min-w-[2ch] text-center font-mono">{c.quantidade}</span>
                  <Button size="icon" variant="outline" onClick={() => alterarQtd(i, +1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                  <div className="ml-auto text-right">
                    <div className="text-xs text-muted-foreground">{formatBRL(c.precoUnitario)}</div>
                    <div className="font-semibold">
                      {formatBRL(c.precoUnitario * c.quantidade - c.desconto)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatBRL(subtotal)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span>{formatBRL(subtotal)}</span>
            </div>
            {erro && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3 w-3" /> {erro}
              </div>
            )}
            <Button
              variant="accent"
              className="h-12 w-full text-base"
              onClick={finalizar}
              disabled={carrinho.length === 0 || finalizando}
            >
              {finalizando ? "Registrando..." : "Finalizar (F9)"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
