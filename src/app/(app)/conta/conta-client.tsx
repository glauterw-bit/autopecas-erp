"use client";

import { useState } from "react";

const campo = "mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm";

export function ContaClient() {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [repetir, setRepetir] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function trocar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (nova !== repetir) {
      setMsg({ ok: false, texto: "As duas senhas novas não são iguais." });
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch("/api/conta/senha", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ atual, nova }),
      });
      const d = (await r.json()) as { erro?: string };
      if (!r.ok) throw new Error(d.erro ?? "Não foi possível trocar a senha.");
      setMsg({ ok: true, texto: "Senha trocada. Os outros aparelhos conectados foram desconectados." });
      setAtual("");
      setNova("");
      setRepetir("");
    } catch (err) {
      setMsg({ ok: false, texto: (err as Error).message });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={trocar} className="max-w-md space-y-3 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">Trocar a senha</h2>
      <div>
        <label htmlFor="atual" className="text-xs text-muted-foreground">Senha atual</label>
        <input id="atual" required type="password" autoComplete="current-password" value={atual}
          onChange={(e) => setAtual(e.target.value)} className={campo} />
      </div>
      <div>
        <label htmlFor="nova" className="text-xs text-muted-foreground">Senha nova (10 ou mais caracteres, com letras e números)</label>
        <input id="nova" required type="password" autoComplete="new-password" minLength={10} value={nova}
          onChange={(e) => setNova(e.target.value)} className={campo} />
      </div>
      <div>
        <label htmlFor="repetir" className="text-xs text-muted-foreground">Repita a senha nova</label>
        <input id="repetir" required type="password" autoComplete="new-password" value={repetir}
          onChange={(e) => setRepetir(e.target.value)} className={campo} />
      </div>
      {msg && (
        <div role="status" className={`rounded-md p-2 text-xs ${msg.ok ? "bg-green-500/10 text-green-700" : "bg-destructive/10 text-destructive"}`}>
          {msg.texto}
        </div>
      )}
      <button type="submit" disabled={enviando} className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-white disabled:opacity-60">
        {enviando ? "Salvando..." : "Trocar senha"}
      </button>
    </form>
  );
}
