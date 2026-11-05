"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Store } from "lucide-react";
import { cnpjValido, limparCnpj } from "@/lib/validacao/cnpj";

const campo = "mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm";

export default function CadastroPage() {
  const router = useRouter();
  const [f, setF] = useState({ razaoSocial: "", cnpj: "", nome: "", email: "", celular: "", senha: "", aceite: false, website: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  // Ajuda opcional: se o CNPJ é válido, tenta preencher a razão social pela consulta pública.
  async function consultarCnpj() {
    if (!cnpjValido(f.cnpj) || f.razaoSocial) return;
    try {
      const r = await fetch(`/api/cadastro/cnpj?cnpj=${limparCnpj(f.cnpj)}`);
      const j = await r.json();
      if (j.encontrado && j.razaoSocial) set("razaoSocial", j.razaoSocial);
    } catch {
      /* segue com o preenchimento à mão */
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!cnpjValido(f.cnpj)) return setErro("CNPJ inválido. Confira os números.");
    setEnviando(true);
    try {
      const r = await fetch("/api/cadastro", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(f),
      });
      const j = (await r.json()) as { erro?: string; destino?: string };
      if (!r.ok) throw new Error(j.erro ?? "Não foi possível concluir o cadastro.");
      router.push(j.destino ?? "/onboarding");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Store className="h-5 w-5" />
          </div>
        </div>
        <h1 className="text-center text-xl font-bold">Teste o AutoPeças ERP</h1>
        <p className="mb-5 text-center text-sm text-muted-foreground">Cadastre sua loja e use por alguns dias, sem cartão.</p>
        <form onSubmit={enviar} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="cnpj">CNPJ</label>
            <input id="cnpj" required inputMode="text" autoComplete="off" value={f.cnpj} onChange={(e) => set("cnpj", e.target.value)} onBlur={consultarCnpj} className={campo} placeholder="00.000.000/0000-00" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="razao">Razão social</label>
            <input id="razao" required value={f.razaoSocial} onChange={(e) => set("razaoSocial", e.target.value)} className={campo} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="nome">Seu nome</label>
            <input id="nome" required autoComplete="name" value={f.nome} onChange={(e) => set("nome", e.target.value)} className={campo} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="email">E-mail</label>
            <input id="email" required type="email" autoComplete="email" value={f.email} onChange={(e) => set("email", e.target.value)} className={campo} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="celular">Celular (com DDD)</label>
            <input id="celular" required type="tel" autoComplete="tel" value={f.celular} onChange={(e) => set("celular", e.target.value)} className={campo} placeholder="(11) 91234-5678" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="senha">Senha (10 caracteres ou mais, com letras e números)</label>
            <input id="senha" required type="password" autoComplete="new-password" value={f.senha} onChange={(e) => set("senha", e.target.value)} className={campo} />
          </div>
          {/* Honeypot: escondido de quem usa a tela; robô costuma preencher. */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", height: 0, overflow: "hidden" }}>
            <label>Não preencha<input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website", e.target.value)} /></label>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" required checked={f.aceite} onChange={(e) => set("aceite", e.target.checked)} className="mt-1" />
            <span>
              Li e aceito os{" "}
              <Link href="/termos" target="_blank" className="underline">Termos de Uso</Link> e a{" "}
              <Link href="/privacidade" target="_blank" className="underline">Política de Privacidade</Link>.
            </span>
          </label>
          {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
          <button disabled={enviando} className="h-10 w-full rounded-md bg-accent text-sm font-medium text-accent-foreground disabled:opacity-60">
            {enviando ? "Criando…" : "Criar minha conta"}
          </button>
          <p className="text-center text-sm text-muted-foreground">
            Já tem conta? <Link href="/login" className="underline">Entrar</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
