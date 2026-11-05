"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

// Correção de cadastro + selo "aplicação verificada" + revisão.
// Ctrl+Enter salva o formulário.

interface Props {
  produto: {
    id: string;
    nome: string;
    codigoBarras: string;
    codigoFabricante: string;
    codigoOem: string;
    ncm: string;
    localizacao: string;
    qtdAplicacoes: number;
    aplicacaoVerificadaEm: string | null;
    aplicacaoVerificadaPorNome: string | null;
    revisaoCadastro: boolean;
    revisaoCadastroMotivo: string | null;
    revisaoCadastroEm: string | null;
  };
}

const CAMPOS = [
  { chave: "nome", rotulo: "Nome", dica: "" },
  { chave: "codigoFabricante", rotulo: "Código do fabricante", dica: "Como está na caixa da peça" },
  { chave: "codigoOem", rotulo: "Código original (OEM)", dica: "Prefixo e sufixo fazem diferença" },
  { chave: "codigoBarras", rotulo: "Código de barras (EAN)", dica: "8, 12, 13 ou 14 números" },
  { chave: "ncm", rotulo: "NCM", dica: "8 números, ex.: 8708.30.90" },
  { chave: "localizacao", rotulo: "Localização na loja", dica: "Ex.: A3-B12" },
] as const;

type Chave = (typeof CAMPOS)[number]["chave"];

export function EditorCadastro({ produto }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<Record<Chave, string>>({
    nome: produto.nome,
    codigoFabricante: produto.codigoFabricante,
    codigoOem: produto.codigoOem,
    codigoBarras: produto.codigoBarras,
    ncm: produto.ncm,
    localizacao: produto.localizacao,
  });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [motivoRevisao, setMotivoRevisao] = useState("");

  async function salvar(e?: React.FormEvent) {
    e?.preventDefault();
    setSalvando(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/produtos/${produto.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Não foi possível salvar.");
      setMsg({ tipo: "ok", texto: j.alterado ? "Cadastro salvo." : "Nada mudou." });
      router.refresh();
    } catch (err) {
      setMsg({ tipo: "erro", texto: (err as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  async function acao(body: Record<string, string>) {
    setSalvando(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/produtos/${produto.id}/qualidade`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Não foi possível concluir.");
      setMsg({ tipo: "ok", texto: "Feito." });
      setMotivoRevisao("");
      router.refresh();
    } catch (err) {
      setMsg({ tipo: "erro", texto: (err as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Selo de aplicação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {produto.aplicacaoVerificadaEm ? (
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <BadgeCheck className="h-4 w-4" />
              Aplicação verificada por {produto.aplicacaoVerificadaPorNome ?? "—"} em{" "}
              {formatDateTime(produto.aplicacaoVerificadaEm)}
            </div>
          ) : (
            <div className="text-muted-foreground">
              Aplicação não verificada.{" "}
              {produto.qtdAplicacoes === 0 && "Cadastre pelo menos uma aplicação antes de verificar."}
            </div>
          )}
          {produto.revisaoCadastro && (
            <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-amber-800 dark:text-amber-300">
              <Wrench className="mt-0.5 h-4 w-4" />
              <div>
                <div className="font-medium">Marcado para revisão</div>
                <div className="text-xs">
                  {produto.revisaoCadastroMotivo}
                  {produto.revisaoCadastroEm && ` (${formatDateTime(produto.revisaoCadastroEm)})`}
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="accent"
              size="sm"
              disabled={salvando || produto.qtdAplicacoes === 0}
              onClick={() => acao({ acao: "verificar" })}
            >
              <BadgeCheck className="h-4 w-4" /> Conferi a aplicação
            </Button>
            {produto.aplicacaoVerificadaEm && (
              <Button variant="outline" size="sm" disabled={salvando} onClick={() => acao({ acao: "remover_selo" })}>
                Tirar selo
              </Button>
            )}
            {produto.revisaoCadastro && (
              <Button variant="outline" size="sm" disabled={salvando} onClick={() => acao({ acao: "concluir_revisao" })}>
                Revisão concluída
              </Button>
            )}
          </div>
          {!produto.revisaoCadastro && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (motivoRevisao.trim().length >= 3) acao({ acao: "marcar_revisao", motivo: motivoRevisao.trim() });
              }}
            >
              <label htmlFor="motivo-revisao" className="sr-only">
                O que está errado no cadastro
              </label>
              <Input
                id="motivo-revisao"
                value={motivoRevisao}
                onChange={(e) => setMotivoRevisao(e.target.value)}
                placeholder="Achou erro? Diga o que está errado"
                maxLength={300}
                className="h-8 text-xs"
              />
              <Button type="submit" size="sm" variant="outline" disabled={salvando || motivoRevisao.trim().length < 3}>
                Marcar revisão
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Corrigir cadastro</CardTitle>
          <p className="text-xs text-muted-foreground">Preço e estoque não mudam aqui. Ctrl+Enter salva.</p>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={salvar}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) salvar();
            }}
            className="space-y-3"
          >
            {CAMPOS.map((c) => (
              <div key={c.chave}>
                <label htmlFor={`cad-${c.chave}`} className="text-xs text-muted-foreground">
                  {c.rotulo}
                  {c.dica && <span className="opacity-70"> · {c.dica}</span>}
                </label>
                <Input
                  id={`cad-${c.chave}`}
                  value={form[c.chave]}
                  onChange={(e) => setForm((f) => ({ ...f, [c.chave]: e.target.value }))}
                  className="mt-1"
                />
              </div>
            ))}
            {msg && (
              <p role={msg.tipo === "erro" ? "alert" : "status"} className={msg.tipo === "erro" ? "text-sm text-destructive" : "text-sm text-emerald-600"}>
                {msg.texto}
              </p>
            )}
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
