"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function Form() {
  const token = useSearchParams().get("token") ?? "";
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha !== repetir) return setErro("As duas senhas não são iguais.");
    const r = await fetch("/api/auth/redefinir", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, senha }),
    });
    const d = (await r.json()) as { erro?: string };
    if (!r.ok) return setErro(d.erro ?? "Não foi possível salvar.");
    setFeito(true);
  }

  if (feito)
    return (
      <p className="text-center text-sm">
        Senha salva. <a className="text-accent underline" href="/login">Entrar</a>
      </p>
    );
  return (
    <form onSubmit={enviar} className="space-y-3">
      <div>
        <label htmlFor="s" className="text-xs text-muted-foreground">Senha nova (10 ou mais caracteres, com letras e números)</label>
        <input id="s" required type="password" minLength={10} autoComplete="new-password" value={senha}
          onChange={(e) => setSenha(e.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" />
      </div>
      <div>
        <label htmlFor="r" className="text-xs text-muted-foreground">Repita a senha</label>
        <input id="r" required type="password" autoComplete="new-password" value={repetir}
          onChange={(e) => setRepetir(e.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" />
      </div>
      {erro && <div role="alert" className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{erro}</div>}
      <button type="submit" className="h-10 w-full rounded-md bg-accent font-medium text-white">Salvar senha</button>
    </form>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="mb-4 text-center text-xl font-bold">Criar nova senha</h1>
        <Suspense>
          <Form />
        </Suspense>
      </div>
    </div>
  );
}
