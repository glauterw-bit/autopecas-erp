"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";

export default function B2BLoginPage() {
  const router = useRouter();
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const r = await fetch("/api/b2b/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cpfCnpj, senha }),
      });
      if (!r.ok) {
        const e = (await r.json()) as { erro?: string };
        throw new Error(e.erro ?? "Credenciais inválidas");
      }
      router.push("/b2b");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <LogIn className="h-5 w-5" />
          </div>
        </div>
        <h1 className="text-center text-xl font-bold">Portal Cliente</h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Mecânicas, frotistas e revendas
        </p>
        <form onSubmit={entrar} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">CPF ou CNPJ</label>
            <input
              required
              value={cpfCnpj}
              onChange={(e) => setCpfCnpj(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
              placeholder="00.000.000/0000-00"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Senha</label>
            <input
              required
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
            />
          </div>
          {erro && (
            <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{erro}</div>
          )}
          <button
            type="submit"
            disabled={carregando}
            className="h-10 w-full rounded-md bg-accent font-medium text-white disabled:opacity-60"
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Não tem acesso? Procure seu vendedor.
        </p>
      </div>
    </div>
  );
}
