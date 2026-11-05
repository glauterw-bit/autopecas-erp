"use client";

import { useState } from "react";

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const r = await fetch("/api/auth/esqueci", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const d = (await r.json()) as { erro?: string; mensagem?: string };
    if (!r.ok) setErro(d.erro ?? "Não foi possível enviar.");
    else setMsg(d.mensagem ?? "Pedido enviado.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="mb-1 text-center text-xl font-bold">Esqueci a senha</h1>
        <p className="mb-4 text-center text-sm text-muted-foreground">Informe o e-mail do seu acesso.</p>
        {msg ? (
          <p role="status" className="text-sm">{msg}</p>
        ) : (
          <form onSubmit={enviar} className="space-y-3">
            <label htmlFor="e" className="text-xs text-muted-foreground">E-mail</label>
            <input id="e" required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
            {erro && <div role="alert" className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{erro}</div>}
            <button type="submit" className="h-10 w-full rounded-md bg-accent font-medium text-white">Enviar link</button>
          </form>
        )}
        <p className="mt-4 text-center text-xs"><a href="/login" className="text-accent hover:underline">Voltar ao login</a></p>
      </div>
    </div>
  );
}
