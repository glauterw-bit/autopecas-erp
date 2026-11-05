"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, BadgeCheck, Camera, Car, CheckCircle2, MapPin, Minus, PackageX, Plus, Search, ShieldCheck, Trash2, User, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/utils";
import { PaymentModal, type LinhaPagamento } from "./payment-modal";
import { VendaPerdidaModal } from "./venda-perdida-modal";

type TipoVendaPdv = "VENDA" | "ORCAMENTO" | "CONDICIONAL";

const TIPOS_VENDA: Array<{ valor: TipoVendaPdv; label: string }> = [
  { valor: "VENDA", label: "Venda" },
  { valor: "ORCAMENTO", label: "Orçamento" },
  { valor: "CONDICIONAL", label: "Condicional" },
];

interface Produto {
  id: string;
  sku: string;
  nome: string;
  marca: string | null;
  precoVenda: number;
  precoPromocional: number | null;
  precoMinimo: number | null;
  custoMedio: number;
  estoque: number;
  fotoPrincipal: string | null;
  localizacao: string | null;
  garantiaMeses: number | null;
  unidade: string;
  matchTipo: "EXATO" | "APLICACAO" | "TEXTO";
  aplicacaoVerificada?: boolean;
  revisaoCadastro?: boolean;
}

interface ItemCarrinho {
  produtoId: string;
  sku: string;
  nome: string;
  quantidade: number;
  precoUnitario: number;
  custoUnitario: number;
  precoMinimo: number | null;
  desconto: number;
  localizacao: string | null;
}

const TECLAS = [
  { tecla: "F2", acao: "Cliente" },
  { tecla: "F3", acao: "Placa" },
  { tecla: "F4", acao: "Foto IA" },
  { tecla: "F6", acao: "Desconto" },
  { tecla: "F7", acao: "Devolução" },
  { tecla: "F8", acao: "Não tínhamos" },
  { tecla: "F9", acao: "Pagar" },
  { tecla: "ESC", acao: "Cancelar" },
];

function margemHealth(precoUnitario: number, custo: number, precoMin: number | null) {
  const margem = precoUnitario > 0 ? (precoUnitario - custo) / precoUnitario : 0;
  if (precoMin && precoUnitario < precoMin) return { cor: "bg-red-500", label: "abaixo do mínimo", pct: margem };
  if (margem < 0.1) return { cor: "bg-amber-500", label: "margem baixa", pct: margem };
  return { cor: "bg-emerald-500", label: "ok", pct: margem };
}

export function PdvClient() {
  const router = useRouter();
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<Produto[]>([]);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [placa, setPlaca] = useState("");
  const [veiculoDescricao, setVeiculoDescricao] = useState<string | null>(null);
  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(null);
  const [descontoGeral, setDescontoGeral] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarPagamento, setMostrarPagamento] = useState(false);
  // Incrementa para remontar o modal de pagamento (limpa pagamentos parciais)
  // quando o servidor recota o total por promoção (422 com `promocoes`).
  const [pagamentoKey, setPagamentoKey] = useState(0);
  const [sucesso, setSucesso] = useState<{ numero: number; tipo: TipoVendaPdv; dias?: number } | null>(null);
  const [selecionado, setSelecionado] = useState(0);
  const [tipoVenda, setTipoVenda] = useState<TipoVendaPdv>("VENDA");
  const [diasRetorno, setDiasRetorno] = useState(7);
  const [vendaPerdida, setVendaPerdida] = useState<{ descricao: string; produtoId?: string | null } | null>(null);
  const [toast, setToast] = useState<{ msg: string; tipo: "ok" | "erro" } | null>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  const notificar = useCallback((msg: string, tipo: "ok" | "erro") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    buscaRef.current?.focus();
  }, []);

  const subtotal = useMemo(
    () => carrinho.reduce((a, c) => a + c.precoUnitario * c.quantidade - c.desconto, 0),
    [carrinho],
  );
  const total = Math.max(0, subtotal - descontoGeral);
  const custoTotal = useMemo(
    () => carrinho.reduce((a, c) => a + c.custoUnitario * c.quantidade, 0),
    [carrinho],
  );
  const margemTotal = total - custoTotal;
  const margemPct = total > 0 ? (margemTotal / total) * 100 : 0;

  const adicionar = useCallback((p: Produto, qtd = 1) => {
    setCarrinho((cs) => {
      const existente = cs.find((c) => c.produtoId === p.id);
      if (existente) {
        return cs.map((c) => (c.produtoId === p.id ? { ...c, quantidade: c.quantidade + qtd } : c));
      }
      return [
        ...cs,
        {
          produtoId: p.id,
          sku: p.sku,
          nome: p.nome,
          quantidade: qtd,
          precoUnitario: p.precoPromocional ?? p.precoVenda,
          custoUnitario: p.custoMedio,
          precoMinimo: p.precoMinimo,
          desconto: 0,
          localizacao: p.localizacao,
        },
      ];
    });
    setTermo("");
    setResultados([]);
    setSelecionado(0);
    buscaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!termo) {
      setResultados([]);
      return;
    }
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const mult = termo.match(/^(\d+)\s*\*\s*(.+)$/);
        const consulta = mult ? mult[2] : termo;
        const r = await fetch(`/api/produtos/buscar-pdv?q=${encodeURIComponent(consulta)}`);
        const lista = (await r.json()) as Produto[];
        if (mult && lista[0]?.matchTipo === "EXATO") {
          adicionar(lista[0], Number(mult[1]));
          return;
        }
        setResultados(Array.isArray(lista) ? lista : []);
        setSelecionado(0);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setBuscando(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [termo, adicionar]);

  const consultarPlaca = useCallback(async (p: string) => {
    setPlaca(p);
    try {
      const r = await fetch(`/api/veiculos/buscar-placa?placa=${encodeURIComponent(p)}`);
      const json = (await r.json()) as { encontrado?: boolean; dados?: { marca?: string; modelo?: string; anoModelo?: number } };
      if (json.encontrado && json.dados) {
        setVeiculoDescricao(`${json.dados.marca ?? ""} ${json.dados.modelo ?? ""} ${json.dados.anoModelo ?? ""}`.trim());
      } else {
        setVeiculoDescricao(`Placa ${p.toUpperCase()}`);
      }
    } catch {
      setVeiculoDescricao(`Placa ${p.toUpperCase()}`);
    }
  }, []);

  const buscarCliente = useCallback(async () => {
    const q = prompt("Buscar cliente (nome/CPF/telefone):");
    if (!q) return;
    const r = await fetch(`/api/clientes?q=${encodeURIComponent(q)}`);
    const lista = (await r.json()) as Array<{ id: string; nome: string }>;
    if (lista[0]) setCliente({ id: lista[0].id, nome: lista[0].nome });
    else alert("Nenhum cliente encontrado.");
  }, []);

  const alterarQtd = (i: number, delta: number) => {
    setCarrinho((cs) =>
      cs
        .map((c, idx) => (idx === i ? { ...c, quantidade: Math.max(0, c.quantidade + delta) } : c))
        .filter((c) => c.quantidade > 0),
    );
  };
  const removerItem = (i: number) => setCarrinho((cs) => cs.filter((_, idx) => idx !== i));
  const editarPreco = (i: number, novo: number) =>
    setCarrinho((cs) => cs.map((c, idx) => (idx === i ? { ...c, precoUnitario: novo } : c)));

  const finalizar = useCallback(
    async (pagamentos: LinhaPagamento[]) => {
      setErro(null);
      try {
        const r = await fetch("/api/vendas", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tipo: tipoVenda,
            origem: "PDV",
            clienteId: cliente?.id ?? null,
            veiculoPlaca: placa || null,
            descontoGeral,
            ...(tipoVenda === "CONDICIONAL" ? { diasRetorno } : {}),
            itens: carrinho.map((c) => ({
              produtoId: c.produtoId,
              quantidade: c.quantidade,
              precoUnitario: c.precoUnitario,
              desconto: c.desconto,
            })),
            pagamentos: pagamentos.map((p) => ({
              formaPagamento: p.forma,
              valor: p.valor,
              parcelas: p.parcelas,
            })),
          }),
        });
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as {
            erro?: string;
            valorTotal?: number;
            promocoes?: Array<{
              produtoId: string;
              promocaoNome: string;
              precoPromocional: number;
            }>;
          };
          if (r.status === 422 && j.promocoes?.length) {
            // Promoção aplicada pelo servidor mudou o total: recota o
            // carrinho com os preços promocionais e reabre o pagamento.
            const porProduto = new Map(
              j.promocoes.map((p) => [p.produtoId, p.precoPromocional]),
            );
            setCarrinho((cs) =>
              cs.map((c) => {
                const precoPromo = porProduto.get(c.produtoId);
                return precoPromo !== undefined && precoPromo < c.precoUnitario
                  ? { ...c, precoUnitario: precoPromo }
                  : c;
              }),
            );
            setPagamentoKey((k) => k + 1);
            setMostrarPagamento(true);
            notificar(
              "Promoção aplicada pelo servidor: preços do carrinho atualizados. Confira o novo total e refaça o pagamento.",
              "erro",
            );
            throw new Error(j.erro ?? "Total da venda atualizado por promoção.");
          }
          throw new Error(j.erro ?? "Falha ao registrar venda");
        }
        const venda = (await r.json()) as {
          numero: number;
          promocoesAplicadas?: Array<{ promocaoNome: string; precoPromocional: number }>;
        };
        if (venda.promocoesAplicadas?.length) {
          notificar(
            `${venda.promocoesAplicadas.length} item(ns) com preço promocional aplicado automaticamente.`,
            "ok",
          );
        }
        setMostrarPagamento(false);
        setSucesso({ numero: venda.numero, tipo: tipoVenda, dias: diasRetorno });
        setCarrinho([]);
        setDescontoGeral(0);
        setVeiculoDescricao(null);
        setPlaca("");
        setCliente(null);
        setTipoVenda("VENDA");
        setDiasRetorno(7);
      } catch (e) {
        setErro((e as Error).message);
        throw e;
      }
    },
    [tipoVenda, cliente, placa, descontoGeral, diasRetorno, carrinho, notificar],
  );

  // Orçamento e condicional não passam pelo modal de pagamento.
  const fecharSemPagamento = useCallback(() => {
    finalizar([]).catch(() => undefined); // erro já exibido via setErro
  }, [finalizar]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (mostrarPagamento || vendaPerdida) return;
      if (sucesso) { if (e.key === "Enter") setSucesso(null); return; }
      if (e.key === "F9") {
        e.preventDefault();
        if (carrinho.length) {
          if (tipoVenda === "VENDA") setMostrarPagamento(true);
          else fecharSemPagamento();
        }
      }
      else if (e.key === "F8") {
        // "Não tínhamos": registra a venda perdida em 2 segundos.
        e.preventDefault();
        const sel = resultados[selecionado];
        if (sel && sel.estoque <= 0) setVendaPerdida({ descricao: `${sel.nome} (SKU ${sel.sku})`, produtoId: sel.id });
        else setVendaPerdida({ descricao: termo.replace(/^\d+\s*\*\s*/, "").trim() });
      }
      else if (e.key === "F7") { e.preventDefault(); router.push("/pdv/devolucao"); }
      else if (e.key === "F2") { e.preventDefault(); buscarCliente(); }
      else if (e.key === "F3") { e.preventDefault(); const p = prompt("Placa do veículo:"); if (p) consultarPlaca(p); }
      else if (e.key === "F6") { e.preventDefault(); const d = prompt("Desconto geral (R$):"); if (d) setDescontoGeral(Number(d.replace(",", ".")) || 0); }
      else if (e.key === "Escape") { e.preventDefault(); setResultados([]); }
      else if (e.key === "ArrowDown" && resultados.length) { e.preventDefault(); setSelecionado((s) => Math.min(s + 1, resultados.length - 1)); }
      else if (e.key === "ArrowUp" && resultados.length) { e.preventDefault(); setSelecionado((s) => Math.max(s - 1, 0)); }
      else if (e.key === "Enter" && resultados.length && !termo.includes("*")) { e.preventDefault(); adicionar(resultados[selecionado]); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [carrinho, resultados, selecionado, termo, mostrarPagamento, vendaPerdida, sucesso, adicionar, buscarCliente, consultarPlaca, tipoVenda, fecharSemPagamento, router]);

  return (
    <div className="grid h-[calc(100vh-3rem)] grid-cols-[1fr_420px] gap-4">
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-muted-foreground" />
              <Input
                ref={buscaRef}
                placeholder="Bipe o código, ou busque por SKU, OEM, nome…  (use 3*código p/ quantidade)"
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                className="h-12 border-0 text-base shadow-none focus-visible:ring-0"
              />
              <Button variant="outline" size="icon" title="Identificar peça por foto (AutoVision)">
                <Camera className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                title="Não tínhamos a peça: registrar venda perdida (F8)"
                onClick={() => setVendaPerdida({ descricao: termo.replace(/^\d+\s*\*\s*/, "").trim() })}
              >
                <PackageX className="h-4 w-4" /> Não tínhamos <kbd className="ml-1 rounded border px-1 text-[10px]">F8</kbd>
              </Button>
              <Button variant="outline" size="icon" title="Buscar por placa (F3)" onClick={() => { const p = prompt("Placa:"); if (p) consultarPlaca(p); }}>
                <Car className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              {cliente && (
                <Badge variant="accent" className="gap-1">
                  <User className="h-3 w-3" /> {cliente.nome}
                  <button className="ml-1" onClick={() => setCliente(null)}><X className="h-3 w-3" /></button>
                </Badge>
              )}
              {veiculoDescricao && (
                <Badge variant="muted" className="gap-1">
                  <Car className="h-3 w-3" /> {veiculoDescricao}
                  <button className="ml-1" onClick={() => { setVeiculoDescricao(null); setPlaca(""); }}><X className="h-3 w-3" /></button>
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="flex-1 overflow-hidden">
          <CardContent className="h-full overflow-auto p-2">
            {buscando && <div className="p-6 text-center text-sm text-muted-foreground">Buscando…</div>}
            {!buscando && resultados.length === 0 && termo && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <p>Nada para &quot;{termo}&quot;. Tente o código OEM ou o nome da peça.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setVendaPerdida({ descricao: termo })}
                >
                  <PackageX className="h-3 w-3" /> Não tínhamos (F8)
                </Button>
              </div>
            )}
            {!buscando && resultados.length === 0 && !termo && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <Search className="h-10 w-10 opacity-40" />
                <p className="text-sm">Comece bipando ou buscando uma peça</p>
                <p className="text-xs">↑↓ navega · Enter adiciona · F9 paga</p>
              </div>
            )}
            {resultados.map((p, idx) => {
              const preco = p.precoPromocional ?? p.precoVenda;
              const sel = idx === selecionado;
              return (
                <button
                  key={p.id}
                  onClick={() => adicionar(p)}
                  onMouseEnter={() => setSelecionado(idx)}
                  className={`flex w-full items-center gap-3 rounded-md p-3 text-left transition-colors ${sel ? "bg-accent/10 ring-1 ring-accent" : "hover:bg-secondary"}`}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] text-muted-foreground">
                    {p.sku}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.nome}</div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {p.marca && <Badge variant="muted">{p.marca}</Badge>}
                      <span className={p.estoque > 0 ? "" : "text-red-500"}>
                        {p.estoque > 0 ? `${p.estoque} ${p.unidade}` : "sem estoque"}
                      </span>
                      {p.estoque <= 0 && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setVendaPerdida({ descricao: `${p.nome} (SKU ${p.sku})`, produtoId: p.id });
                          }}
                          className="rounded border border-amber-400/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 hover:bg-amber-500/10"
                        >
                          Não tínhamos (F8)
                        </span>
                      )}
                      {p.aplicacaoVerificada && (
                        <span className="flex items-center gap-0.5 text-emerald-600" title="Aplicação conferida por alguém da loja">
                          <BadgeCheck className="h-3 w-3" /> aplicação verificada
                        </span>
                      )}
                      {p.revisaoCadastro && (
                        <span className="flex items-center gap-0.5 text-amber-600" title="Já voltou por erro de cadastro: confira o veículo antes de vender">
                          <Wrench className="h-3 w-3" /> cadastro em revisão
                        </span>
                      )}
                      {p.localizacao && (
                        <span className="flex items-center gap-0.5 text-accent">
                          <MapPin className="h-3 w-3" /> {p.localizacao}
                        </span>
                      )}
                      {p.matchTipo === "EXATO" && <Badge variant="success">match exato</Badge>}
                      {p.matchTipo === "APLICACAO" && <Badge variant="accent">aplicação</Badge>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-semibold">{formatBRL(preco)}</div>
                    {p.precoPromocional && (
                      <div className="text-xs text-muted-foreground line-through">{formatBRL(p.precoVenda)}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
            <Button variant="ghost" size="sm" onClick={() => setCarrinho([])} disabled={carrinho.length === 0}>
              <X className="h-3 w-3" /> Limpar
            </Button>
          </CardHeader>
          <CardContent className="h-full space-y-2 overflow-auto p-3">
            {carrinho.length === 0 && (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Carrinho vazio.
              </div>
            )}
            {carrinho.map((c, i) => {
              const h = margemHealth(c.precoUnitario, c.custoUnitario, c.precoMinimo);
              return (
                <div key={`${c.produtoId}-${i}`} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{c.nome}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>SKU {c.sku}</span>
                        {c.localizacao && <span className="flex items-center gap-0.5 text-accent"><MapPin className="h-3 w-3" />{c.localizacao}</span>}
                      </div>
                    </div>
                    <button onClick={() => removerItem(i)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="icon" variant="outline" onClick={() => alterarQtd(i, -1)}><Minus className="h-3 w-3" /></Button>
                    <span className="min-w-[2ch] text-center font-mono">{c.quantidade}</span>
                    <Button size="icon" variant="outline" onClick={() => alterarQtd(i, +1)}><Plus className="h-3 w-3" /></Button>
                    <input
                      type="number"
                      step="0.01"
                      value={c.precoUnitario}
                      onChange={(e) => editarPreco(i, Number(e.target.value))}
                      className="ml-auto h-8 w-24 rounded-md border bg-background px-2 text-right text-sm font-mono"
                      title="Preço unitário (editável)"
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground" title={h.label}>
                      <span className={`inline-block h-2 w-2 rounded-full ${h.cor}`} />
                      margem {(h.pct * 100).toFixed(0)}%
                    </span>
                    <span className="font-semibold">{formatBRL(c.precoUnitario * c.quantidade - c.desconto)}</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatBRL(subtotal)}</span>
            </div>
            {descontoGeral > 0 && (
              <div className="flex justify-between text-sm text-red-600">
                <span>Desconto</span>
                <span>- {formatBRL(descontoGeral)}</span>
              </div>
            )}
            <div className="flex justify-between text-2xl font-bold">
              <span>Total</span>
              <span>{formatBRL(total)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <ShieldCheck className="h-3 w-3" /> Margem da venda
              </span>
              <span className={margemPct < 10 ? "font-semibold text-amber-600" : "font-semibold text-emerald-600"}>
                {formatBRL(margemTotal)} ({margemPct.toFixed(0)}%)
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-md border p-1 text-xs">
              {TIPOS_VENDA.map((t) => (
                <button
                  key={t.valor}
                  onClick={() => setTipoVenda(t.valor)}
                  className={`rounded px-1 py-1.5 font-medium transition-colors ${
                    tipoVenda === t.valor ? "bg-accent text-white" : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {tipoVenda === "CONDICIONAL" && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Retorno em (dias)</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={diasRetorno}
                  onChange={(e) => setDiasRetorno(Math.max(1, Math.min(365, Number(e.target.value) || 7)))}
                  className="h-8 w-16 rounded-md border bg-background px-2 text-right font-mono"
                />
              </div>
            )}
            {erro && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3 w-3" /> {erro}
              </div>
            )}
            <Button
              variant="accent"
              className="h-14 w-full text-lg"
              onClick={() => (tipoVenda === "VENDA" ? setMostrarPagamento(true) : fecharSemPagamento())}
              disabled={carrinho.length === 0}
            >
              {tipoVenda === "VENDA" && <>Pagar (F9) · {formatBRL(total)}</>}
              {tipoVenda === "ORCAMENTO" && <>Salvar orçamento (F9) · {formatBRL(total)}</>}
              {tipoVenda === "CONDICIONAL" && <>Condicional (F9) · {formatBRL(total)}</>}
            </Button>
          </CardContent>
        </Card>
      </div>

      {mostrarPagamento && (
        <PaymentModal key={pagamentoKey} total={total} erro={erro} onCancel={() => setMostrarPagamento(false)} onConfirm={finalizar} />
      )}

      {vendaPerdida && (
        <VendaPerdidaModal
          descricaoInicial={vendaPerdida.descricao}
          produtoId={vendaPerdida.produtoId}
          motivoInicial={vendaPerdida.produtoId ? "SEM_ESTOQUE" : "NAO_TRABALHAMOS"}
          veiculoInicial={veiculoDescricao ?? ""}
          clienteId={cliente?.id ?? null}
          onClose={() => setVendaPerdida(null)}
          onResultado={notificar}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${
            toast.tipo === "ok" ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {sucesso && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSucesso(null)}>
          <div className="w-full max-w-sm rounded-2xl border bg-card p-8 text-center shadow-xl">
            <CheckCircle2 className="mx-auto mb-3 h-14 w-14 text-emerald-500" />
            <h2 className="text-xl font-bold">
              {sucesso.tipo === "VENDA" && <>Venda #{sucesso.numero} concluída!</>}
              {sucesso.tipo === "ORCAMENTO" && <>Orçamento #{sucesso.numero} salvo!</>}
              {sucesso.tipo === "CONDICIONAL" && <>Condicional #{sucesso.numero} registrada!</>}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {sucesso.tipo === "VENDA" && "Estoque baixado e venda registrada."}
              {sucesso.tipo === "ORCAMENTO" && "Orçamento salvo — estoque não foi baixado."}
              {sucesso.tipo === "CONDICIONAL" &&
                `Estoque baixado. Retorno esperado em ${sucesso.dias ?? 7} dia(s).`}
            </p>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSucesso(null)}>Nova venda (Enter)</Button>
              <Button variant="accent" className="flex-1" onClick={() => window.print()}>Imprimir cupom</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
