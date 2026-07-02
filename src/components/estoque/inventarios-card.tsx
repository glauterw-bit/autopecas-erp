"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Plus, Save, SendHorizonal, CheckCheck, XCircle, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";

// Inventário rotativo: lista, abertura (com filtro por curva ABC opcional),
// tela de contagem com qtdContada editável e finalização (só GERENTE).

type Deposito = { id: string; nome: string; tipo: string };

type StatusInventario = "EM_CONTAGEM" | "CONFERENCIA" | "AJUSTADO" | "CANCELADO";

type InventarioResumo = {
  id: string;
  status: StatusInventario;
  criadoEm: string;
  finalizadoEm: string | null;
  deposito: { id: string; nome: string };
  _count: { itens: number };
};

type ItemDetalhe = {
  id: string;
  produtoId: string;
  qtdSistema: string;
  qtdContada: string | null;
  produto: { id: string; sku: string; nome: string; localizacao: string | null };
};

type InventarioDetalhe = InventarioResumo & { itens: ItemDetalhe[] };

const statusBadge: Record<StatusInventario, { label: string; variant: "warning" | "accent" | "success" | "muted" }> = {
  EM_CONTAGEM: { label: "em contagem", variant: "warning" },
  CONFERENCIA: { label: "conferência", variant: "accent" },
  AJUSTADO: { label: "ajustado", variant: "success" },
  CANCELADO: { label: "cancelado", variant: "muted" },
};

const selectClasses =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function InventariosCard({
  depositos,
  ehGerente,
}: {
  depositos: Deposito[];
  ehGerente: boolean;
}) {
  const [inventarios, setInventarios] = useState<InventarioResumo[]>([]);
  const [aberto, setAberto] = useState<InventarioDetalhe | null>(null);
  const [contagens, setContagens] = useState<Record<string, string>>({});
  const [novoDepositoId, setNovoDepositoId] = useState("");
  const [novaCurva, setNovaCurva] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregarLista = useCallback(async () => {
    try {
      const res = await fetch("/api/estoque/inventarios");
      const json = await res.json();
      if (res.ok) setInventarios(json);
    } catch {
      // silencioso; lista recarrega na próxima ação
    }
  }, []);

  useEffect(() => {
    void carregarLista();
  }, [carregarLista]);

  async function chamada(url: string, init?: RequestInit) {
    const res = await fetch(url, init);
    const json = await res.json();
    if (!res.ok) throw new Error(json.erro ?? "Erro na operação");
    return json;
  }

  async function criar() {
    setErro(null);
    setAviso(null);
    if (!novoDepositoId) return setErro("Escolha o depósito do inventário");
    setOcupado(true);
    try {
      const filtro = novaCurva ? { curva: novaCurva } : undefined;
      const json = await chamada("/api/estoque/inventarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositoId: novoDepositoId, filtro }),
      });
      setAviso(`Inventário aberto com ${json._count.itens} itens em ${json.deposito.nome}.`);
      setNovoDepositoId("");
      setNovaCurva("");
      await carregarLista();
      await abrir(json.id);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function abrir(id: string) {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const json = (await chamada(`/api/estoque/inventarios/${id}`)) as InventarioDetalhe;
      setAberto(json);
      const iniciais: Record<string, string> = {};
      for (const item of json.itens) {
        if (item.qtdContada !== null) iniciais[item.produtoId] = String(Number(item.qtdContada));
      }
      setContagens(iniciais);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  function itensParaGravar() {
    return Object.entries(contagens)
      .filter(([, v]) => v.trim() !== "" && !Number.isNaN(Number(v)) && Number(v) >= 0)
      .map(([produtoId, v]) => ({ produtoId, qtdContada: Number(v) }));
  }

  async function salvarContagens(enviarConferencia: boolean) {
    if (!aberto) return;
    setErro(null);
    setAviso(null);
    const itens = itensParaGravar();
    if (itens.length === 0 && !enviarConferencia) {
      return setErro("Preencha ao menos uma contagem");
    }
    setOcupado(true);
    try {
      const body: { itens?: { produtoId: string; qtdContada: number }[]; acao?: string } = {};
      if (itens.length > 0) body.itens = itens;
      if (enviarConferencia) body.acao = "enviar-conferencia";
      await chamada(`/api/estoque/inventarios/${aberto.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setAviso(enviarConferencia ? "Inventário enviado para conferência." : "Contagens gravadas.");
      await carregarLista();
      await abrir(aberto.id);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function finalizar(cancelar: boolean) {
    if (!aberto) return;
    const confirmacao = cancelar
      ? "Cancelar este inventário? Nenhum ajuste será aplicado."
      : "Finalizar o inventário? Os saldos serão AJUSTADOS para as quantidades contadas e movimentos de ajuste serão gerados. Esta ação não pode ser desfeita.";
    if (!window.confirm(confirmacao)) return;
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const json = await chamada(`/api/estoque/inventarios/${aberto.id}/finalizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cancelar ? { acao: "cancelar" } : {}),
      });
      setAviso(
        cancelar
          ? "Inventário cancelado."
          : `Inventário finalizado: ${json.itensAjustados} item(ns) ajustado(s).`,
      );
      await carregarLista();
      await abrir(aberto.id);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  const editavel = aberto?.status === "EM_CONTAGEM" || aberto?.status === "CONFERENCIA";
  const divergencias =
    aberto?.itens.filter((i) => {
      const v = contagens[i.produtoId];
      return v !== undefined && v.trim() !== "" && Number(v) !== Number(i.qtdSistema);
    }).length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4" /> Inventário rotativo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {erro && <p className="text-sm text-red-500">{erro}</p>}
        {aviso && <p className="text-sm text-emerald-600">{aviso}</p>}

        {!aberto && (
          <>
            <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Depósito</label>
                <select
                  className={selectClasses}
                  value={novoDepositoId}
                  onChange={(e) => setNovoDepositoId(e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {depositos.map((d) => (
                    <option key={d.id} value={d.id}>{d.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  Curva ABC (opcional)
                </label>
                <select
                  className={selectClasses}
                  value={novaCurva}
                  onChange={(e) => setNovaCurva(e.target.value)}
                >
                  <option value="">Todos os produtos</option>
                  <option value="A">Curva A</option>
                  <option value="B">Curva B</option>
                  <option value="C">Curva C</option>
                </select>
              </div>
              <Button onClick={criar} disabled={ocupado}>
                <Plus className="mr-2 h-4 w-4" /> Abrir inventário
              </Button>
            </div>

            {inventarios.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum inventário aberto ainda.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="p-2">Aberto em</th>
                      <th className="p-2">Depósito</th>
                      <th className="p-2">Status</th>
                      <th className="p-2 text-right">Itens</th>
                      <th className="p-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {inventarios.map((inv) => {
                      const st = statusBadge[inv.status];
                      return (
                        <tr key={inv.id} className="border-t">
                          <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">
                            {formatDateTime(inv.criadoEm)}
                          </td>
                          <td className="p-2">{inv.deposito.nome}</td>
                          <td className="p-2">
                            <Badge variant={st.variant}>{st.label}</Badge>
                          </td>
                          <td className="p-2 text-right">{inv._count.itens}</td>
                          <td className="p-2 text-right">
                            <Button size="sm" variant="outline" onClick={() => abrir(inv.id)}>
                              {inv.status === "EM_CONTAGEM" || inv.status === "CONFERENCIA"
                                ? "Contar"
                                : "Ver"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {aberto && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setAberto(null)}>
                  <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
                </Button>
                <span className="text-sm font-medium">{aberto.deposito.nome}</span>
                <Badge variant={statusBadge[aberto.status].variant}>
                  {statusBadge[aberto.status].label}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {aberto.itens.length} itens · {divergencias} divergência(s)
                </span>
              </div>
              {editavel && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => salvarContagens(false)} disabled={ocupado}>
                    <Save className="mr-1 h-3 w-3" /> Salvar contagens
                  </Button>
                  {aberto.status === "EM_CONTAGEM" && (
                    <Button size="sm" variant="accent" onClick={() => salvarContagens(true)} disabled={ocupado}>
                      <SendHorizonal className="mr-1 h-3 w-3" /> Enviar p/ conferência
                    </Button>
                  )}
                  {ehGerente && (
                    <>
                      <Button size="sm" onClick={() => finalizar(false)} disabled={ocupado}>
                        <CheckCheck className="mr-1 h-3 w-3" /> Finalizar e ajustar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => finalizar(true)} disabled={ocupado}>
                        <XCircle className="mr-1 h-3 w-3" /> Cancelar
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>

            {editavel && ehGerente && (
              <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-600">
                Ao finalizar, o estoque do depósito será ajustado para as quantidades
                contadas e serão gerados movimentos de ajuste (auditáveis). Ação irreversível.
              </p>
            )}

            <div className="max-h-[28rem] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">SKU</th>
                    <th className="p-2">Produto</th>
                    <th className="p-2">Localização</th>
                    <th className="p-2 text-right">Qtd sistema</th>
                    <th className="p-2 text-right">Qtd contada</th>
                  </tr>
                </thead>
                <tbody>
                  {aberto.itens.map((item) => {
                    const valor = contagens[item.produtoId] ?? "";
                    const divergente =
                      valor.trim() !== "" && Number(valor) !== Number(item.qtdSistema);
                    return (
                      <tr key={item.id} className={`border-t ${divergente ? "bg-amber-500/10" : ""}`}>
                        <td className="p-2 font-mono text-xs">{item.produto.sku}</td>
                        <td className="p-2">{item.produto.nome}</td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {item.produto.localizacao ?? "—"}
                        </td>
                        <td className="p-2 text-right">{Number(item.qtdSistema)}</td>
                        <td className="p-2 text-right">
                          {editavel ? (
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              className="ml-auto h-8 w-24 text-right"
                              value={valor}
                              onChange={(e) =>
                                setContagens((c) => ({ ...c, [item.produtoId]: e.target.value }))
                              }
                            />
                          ) : (
                            <span>{item.qtdContada !== null ? Number(item.qtdContada) : "—"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
