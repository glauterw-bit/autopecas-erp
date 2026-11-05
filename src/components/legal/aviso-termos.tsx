"use client";

// Aviso para o usuário logado aceitar a versão nova dos termos.
// Montagem: dentro do layout de (app), uma vez, por exemplo logo antes de {children}:
//   <AvisoTermos />
// Ele mesmo consulta GET /api/legal/aceite e só aparece se houver versão pendente.
import Link from "next/link";
import { useEffect, useState } from "react";

export function AvisoTermos() {
  const [versao, setVersao] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/legal/aceite")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { pendente?: boolean; versao?: string } | null) => {
        if (vivo && d?.pendente && d.versao) setVersao(d.versao);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  if (!versao) return null;

  async function aceitar() {
    setEnviando(true);
    setErro(null);
    const r = await fetch("/api/legal/aceite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ versao }),
    });
    setEnviando(false);
    if (r.ok) setVersao(null);
    else setErro(((await r.json().catch(() => ({}))) as { erro?: string }).erro ?? "Não foi possível registrar. Tente de novo.");
  }

  return (
    <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-yellow-500 bg-yellow-50 p-3 text-sm text-black">
      <span>
        Os termos de uso, a política de privacidade e o contrato de dados foram atualizados (versão {versao}). Leia{" "}
        <Link href="/termos" className="underline" target="_blank">os termos</Link>,{" "}
        <Link href="/privacidade" className="underline" target="_blank">a privacidade</Link> e{" "}
        <Link href="/dpa" className="underline" target="_blank">o contrato de dados</Link>.
      </span>
      <button
        type="button"
        onClick={aceitar}
        disabled={enviando}
        className="rounded-md bg-black px-3 py-1.5 font-medium text-white disabled:opacity-60"
      >
        {enviando ? "Registrando…" : "Li e aceito"}
      </button>
      {erro && <span className="text-red-700">{erro}</span>}
    </div>
  );
}
