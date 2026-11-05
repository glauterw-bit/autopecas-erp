"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";

// Botão "Liguei": registra o contato com a oficina (não envia mensagem).
export function BotaoContato({ clienteId, compacto = false }: { clienteId: string; compacto?: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nota, setNota] = useState("");
  const [estado, setEstado] = useState<"livre" | "enviando" | "ok" | "erro">("livre");
  const [erro, setErro] = useState("");

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    try {
      const r = await fetch(`/api/clientes/${clienteId}/crm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acao: "contato", nota: nota.trim() || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Não foi possível registrar.");
      setEstado("ok");
      setAberto(false);
      router.refresh();
    } catch (err) {
      setErro((err as Error).message);
      setEstado("erro");
    }
  }

  if (estado === "ok") return <span className="text-xs text-emerald-600" role="status">Contato registrado</span>;
  if (!aberto) {
    return (
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
        <PhoneCall className="h-3.5 w-3.5" /> {compacto ? "Liguei" : "Registrar contato"}
      </Button>
    );
  }
  return (
    <form onSubmit={registrar} className="flex flex-wrap items-center gap-2">
      <label htmlFor={`nota-${clienteId}`} className="sr-only">
        Como foi o contato
      </label>
      <input
        id={`nota-${clienteId}`}
        autoFocus
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setAberto(false)}
        maxLength={300}
        placeholder="Como foi? (opcional) · Enter salva"
        className="h-8 w-56 rounded-md border bg-background px-2 text-xs"
      />
      <Button size="sm" type="submit" disabled={estado === "enviando"}>
        {estado === "enviando" ? "Salvando…" : "Salvar"}
      </Button>
      {estado === "erro" && <span className="text-xs text-destructive" role="alert">{erro}</span>}
    </form>
  );
}

// Condições comerciais (FINANCEIRO+) e carteira (GERENTE+).
export function CondicoesCliente(props: {
  clienteId: string;
  prazoPagamentoDias: number | null;
  limiteCredito: number | null;
  vendedorResponsavelId: string | null;
  podeCondicoes: boolean;
  podeCarteira: boolean;
  vendedores: Array<{ id: string; nome: string }>;
}) {
  const router = useRouter();
  const [prazo, setPrazo] = useState(props.prazoPagamentoDias?.toString() ?? "");
  const [limite, setLimite] = useState(props.limiteCredito?.toFixed(2).replace(".", ",") ?? "");
  const [vendedor, setVendedor] = useState(props.vendedorResponsavelId ?? "");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function enviar(body: unknown) {
    setMsg(null);
    const r = await fetch(`/api/clientes/${props.clienteId}/crm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) {
      setMsg({ tipo: "erro", texto: j.erro ?? "Não foi possível salvar." });
      return;
    }
    setMsg({ tipo: "ok", texto: "Salvo." });
    router.refresh();
  }

  return (
    <div className="space-y-3 text-sm">
      {props.podeCondicoes && (
        <form
          className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const l = Number(limite.replace(/\./g, "").replace(",", "."));
            if (limite && Number.isNaN(l)) {
              setMsg({ tipo: "erro", texto: "Limite inválido." });
              return;
            }
            enviar({
              acao: "condicoes",
              prazoPagamentoDias: prazo === "" ? null : Number(prazo),
              ...(limite !== "" ? { limiteCredito: l } : {}),
            });
          }}
        >
          <div>
            <label htmlFor="cli-prazo" className="text-xs text-muted-foreground">Prazo (dias)</label>
            <input
              id="cli-prazo"
              inputMode="numeric"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value.replace(/\D/g, ""))}
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-right"
            />
          </div>
          <div>
            <label htmlFor="cli-limite" className="text-xs text-muted-foreground">Limite de crédito (R$)</label>
            <input
              id="cli-limite"
              inputMode="decimal"
              value={limite}
              onChange={(e) => setLimite(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-right"
            />
          </div>
          <Button type="submit" size="sm" className="h-9">Salvar</Button>
        </form>
      )}
      {props.podeCarteira && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="cli-vendedor" className="text-xs text-muted-foreground">Responsável pela carteira</label>
            <select
              id="cli-vendedor"
              value={vendedor}
              onChange={(e) => setVendedor(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border bg-background px-2"
            >
              <option value="">Sem responsável</option>
              {props.vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
          </div>
          <Button size="sm" className="h-9" onClick={() => enviar({ acao: "responsavel", vendedorId: vendedor || null })}>
            Definir
          </Button>
        </div>
      )}
      {msg && (
        <p role={msg.tipo === "erro" ? "alert" : "status"} className={msg.tipo === "erro" ? "text-destructive" : "text-emerald-600"}>
          {msg.texto}
        </p>
      )}
    </div>
  );
}
