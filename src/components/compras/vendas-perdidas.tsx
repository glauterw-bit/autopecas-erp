"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CircleSlash, Plus, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";

// Vendas perdidas: lista as últimas 100 e permite registrar manualmente.
// Consome GET/POST /api/vendas-perdidas (mesmo contrato usado pelo PDV).

type Motivo = "SEM_ESTOQUE" | "PRECO" | "PRAZO_ENTREGA" | "NAO_TRABALHAMOS" | "OUTRO";

const MOTIVOS: Record<Motivo, string> = {
  SEM_ESTOQUE: "Sem estoque",
  PRECO: "Preço",
  PRAZO_ENTREGA: "Prazo de entrega",
  NAO_TRABALHAMOS: "Não trabalhamos",
  OUTRO: "Outro",
};

type VendaPerdida = {
  id: string;
  descricaoBuscada: string;
  quantidade: string | number;
  motivo: Motivo;
  observacao: string | null;
  criadoEm: string;
  produto: { id: string; sku: string; nome: string } | null;
};

export function VendasPerdidas() {
  const [registros, setRegistros] = useState<VendaPerdida[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // form
  const [descricao, setDescricao] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [motivo, setMotivo] = useState<Motivo>("SEM_ESTOQUE");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/vendas-perdidas");
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro ?? "Falha ao carregar vendas perdidas");
      setRegistros(json);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function registrar(e: FormEvent) {
    e.preventDefault();
    if (!descricao.trim()) return;
    setSalvando(true);
    setErro(null);
    try {
      const qtd = Number(quantidade);
      const res = await fetch("/api/vendas-perdidas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descricaoBuscada: descricao.trim(),
          quantidade: Number.isFinite(qtd) && qtd > 0 ? qtd : 1,
          motivo,
          observacao: observacao.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro ?? "Falha ao registrar");
      setDescricao("");
      setQuantidade("1");
      setMotivo("SEM_ESTOQUE");
      setObservacao("");
      await carregar();
    } catch (e2) {
      setErro((e2 as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CircleSlash className="h-5 w-5 text-accent" /> Vendas perdidas recentes
          </span>
          <Button size="sm" variant="outline" onClick={carregar} disabled={carregando}>
            <RefreshCw className={`mr-2 h-3 w-3 ${carregando ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={registrar}
          className="grid grid-cols-1 items-end gap-2 rounded-md border bg-muted/30 p-3 md:grid-cols-[2fr_90px_170px_2fr_auto]"
        >
          <label className="text-xs text-muted-foreground">
            O que o cliente buscava?
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder='ex.: "pastilha freio Onix 2019"'
              className="mt-1"
              required
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Qtd
            <Input
              type="number"
              min="0.001"
              step="any"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Motivo
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value as Motivo)}
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {Object.entries(MOTIVOS).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Observação (opcional)
            <Input
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="detalhes"
              className="mt-1"
            />
          </label>
          <Button type="submit" disabled={salvando || !descricao.trim()}>
            <Plus className="mr-2 h-4 w-4" />
            {salvando ? "Salvando…" : "Registrar"}
          </Button>
        </form>

        {erro && <p className="text-sm text-red-500">{erro}</p>}

        {carregando && registros.length === 0 ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : registros.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma venda perdida registrada ainda.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Descrição buscada</th>
                  <th className="px-4 py-2 font-medium">Produto</th>
                  <th className="px-4 py-2 font-medium">Motivo</th>
                  <th className="px-4 py-2 text-right font-medium">Qtd</th>
                  <th className="px-4 py-2 font-medium">Quando</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      {r.descricaoBuscada}
                      {r.observacao && (
                        <span className="block text-xs text-muted-foreground">
                          {r.observacao}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {r.produto ? (
                        <span>
                          <span className="font-mono text-xs">{r.produto.sku}</span>{" "}
                          {r.produto.nome}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={r.motivo === "SEM_ESTOQUE" ? "warning" : "muted"}>
                        {MOTIVOS[r.motivo] ?? r.motivo}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right">{Number(r.quantidade)}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {formatDateTime(r.criadoEm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
