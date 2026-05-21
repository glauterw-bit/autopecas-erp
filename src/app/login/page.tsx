"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Shield } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [totp, setTotp] = useState("");
  const [precisaTotp, setPrecisaTotp] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, senha, totp: totp || undefined }),
      });
      const data = (await r.json()) as { erro?: string; precisaTotp?: boolean };
      if (!r.ok) {
        if (data.precisaTotp) {
          setPrecisaTotp(true);
          setErro("Digite o código do seu app autenticador");
        } else throw new Error(data.erro ?? "Credenciais inválidas");
        return;
      }
      router.push("/dashboard");
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
        <h1 className="text-center text-xl font-bold">AutoPeças ERP</h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">Acesso da equipe</p>
        <form onSubmit={entrar} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
              placeholder="vendedor@autopecasdemo.com.br"
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
          {precisaTotp && (
            <div>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <Shield className="h-3 w-3" /> Código 2FA (6 dígitos)
              </label>
              <input
                inputMode="numeric"
                pattern="\d{6}"
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-center font-mono text-base tracking-widest"
                placeholder="000000"
              />
            </div>
          )}
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
          Acesso de cliente?{" "}
          <a href="/b2b/login" className="text-accent hover:underline">
            Portal B2B
          </a>
        </p>
      </div>
    </div>
  );
}
