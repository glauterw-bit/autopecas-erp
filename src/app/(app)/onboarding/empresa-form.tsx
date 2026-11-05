"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Inicial = {
  inscEstadual: string | null; regimeTributario: string; cep: string | null; logradouro: string | null;
  numero: string | null; bairro: string | null; municipio: string | null; uf: string | null;
};
const campo = "mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm";

export function EmpresaForm({ inicial }: { inicial: Inicial }) {
  const router = useRouter();
  const [f, setF] = useState({
    inscEstadual: inicial.inscEstadual ?? "", regimeTributario: inicial.regimeTributario, cep: inicial.cep ?? "",
    logradouro: inicial.logradouro ?? "", numero: inicial.numero ?? "", bairro: inicial.bairro ?? "",
    municipio: inicial.municipio ?? "", uf: inicial.uf ?? "",
  });
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setMsg(null);
    try {
      const r = await fetch("/api/empresa", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Não foi possível salvar.");
      setMsg({ ok: true, texto: "Salvo." });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, texto: (err as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="grid gap-3 md:grid-cols-3">
      <label className="text-xs text-muted-foreground">Regime tributário
        <select value={f.regimeTributario} onChange={(e) => set("regimeTributario", e.target.value)} className={campo}>
          <option value="SIMPLES_NACIONAL">Simples Nacional</option>
          <option value="LUCRO_PRESUMIDO">Lucro Presumido</option>
          <option value="LUCRO_REAL">Lucro Real</option>
        </select>
      </label>
      <label className="text-xs text-muted-foreground">Inscrição estadual<input value={f.inscEstadual} onChange={(e) => set("inscEstadual", e.target.value)} className={campo} /></label>
      <label className="text-xs text-muted-foreground">CEP<input value={f.cep} onChange={(e) => set("cep", e.target.value)} className={campo} /></label>
      <label className="text-xs text-muted-foreground md:col-span-2">Endereço<input value={f.logradouro} onChange={(e) => set("logradouro", e.target.value)} className={campo} /></label>
      <label className="text-xs text-muted-foreground">Número<input value={f.numero} onChange={(e) => set("numero", e.target.value)} className={campo} /></label>
      <label className="text-xs text-muted-foreground">Bairro<input value={f.bairro} onChange={(e) => set("bairro", e.target.value)} className={campo} /></label>
      <label className="text-xs text-muted-foreground">Cidade<input value={f.municipio} onChange={(e) => set("municipio", e.target.value)} className={campo} /></label>
      <label className="text-xs text-muted-foreground">UF<input maxLength={2} value={f.uf} onChange={(e) => set("uf", e.target.value)} className={campo} /></label>
      <div className="flex items-center gap-3 md:col-span-3">
        <button disabled={salvando} className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-60">Salvar</button>
        {msg && <span role="status" className={msg.ok ? "text-sm text-green-700" : "text-sm text-red-600"}>{msg.texto}</span>}
      </div>
    </form>
  );
}
