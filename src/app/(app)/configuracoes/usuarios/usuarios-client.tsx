"use client";

import { useCallback, useEffect, useState } from "react";

type U = {
  id: string; nome: string; email: string; perfil: string; ativo: boolean;
  ultimoLogin: string | null; convitePendente: boolean; doisFatores: boolean;
};

const PERFIS = ["ADMIN", "GERENTE", "FINANCEIRO", "VENDEDOR", "CAIXA", "ESTOQUISTA", "TECNICO"];
const campo = "h-9 rounded-md border bg-background px-2 text-sm";

export function UsuariosClient({ meuId }: { meuId: string }) {
  const [lista, setLista] = useState<U[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [link, setLink] = useState<{ para: string; url: string; expiraEm: string } | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [perfil, setPerfil] = useState("VENDEDOR");

  const carregar = useCallback(async () => {
    const r = await fetch("/api/usuarios");
    const d = await r.json();
    if (!r.ok) setErro(d.erro ?? "Não foi possível carregar."); else setLista(d);
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  async function chamar(url: string, metodo: string, corpo?: unknown) {
    setErro(null);
    const r = await fetch(url, {
      method: metodo,
      headers: { "content-type": "application/json" },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const d = await r.json();
    if (!r.ok) { setErro(d.erro ?? "Não foi possível concluir."); return null; }
    return d;
  }

  async function convidar(e: React.FormEvent) {
    e.preventDefault();
    const d = await chamar("/api/usuarios", "POST", { nome, email, perfil });
    if (d) {
      setLink({ para: d.usuario.nome, url: d.link, expiraEm: d.expiraEm });
      setNome(""); setEmail("");
      void carregar();
    }
  }
  async function mudar(id: string, dados: { perfil?: string; ativo?: boolean }) {
    if (await chamar(`/api/usuarios/${id}`, "PATCH", dados)) void carregar();
  }
  async function gerarLink(u: U) {
    const d = await chamar(`/api/usuarios/${u.id}/link`, "POST");
    if (d) setLink({ para: u.nome, url: d.link, expiraEm: d.expiraEm });
  }

  return (
    <div className="space-y-6">
      {erro && <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{erro}</div>}
      {link && (
        <div role="status" className="space-y-2 rounded-md border bg-card p-4 text-sm">
          <div className="font-medium">Link de {link.para} (uso único, vale até {new Date(link.expiraEm).toLocaleString("pt-BR")})</div>
          <div className="text-xs text-muted-foreground">Copie e envie agora. Por segurança, este link não aparece de novo.</div>
          <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className={`${campo} w-full font-mono text-xs`} aria-label="Link" />
          <div className="flex gap-2">
            <button type="button" className="rounded-md border px-3 py-1.5 text-xs" onClick={() => navigator.clipboard?.writeText(link.url)}>Copiar</button>
            <button type="button" className="rounded-md border px-3 py-1.5 text-xs" onClick={() => setLink(null)}>Fechar</button>
          </div>
        </div>
      )}

      <form onSubmit={convidar} className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div><label htmlFor="un" className="block text-xs text-muted-foreground">Nome</label>
          <input id="un" required value={nome} onChange={(e) => setNome(e.target.value)} className={campo} /></div>
        <div><label htmlFor="ue" className="block text-xs text-muted-foreground">E-mail</label>
          <input id="ue" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} /></div>
        <div><label htmlFor="up" className="block text-xs text-muted-foreground">Perfil</label>
          <select id="up" value={perfil} onChange={(e) => setPerfil(e.target.value)} className={campo}>
            {PERFIS.map((p) => <option key={p}>{p}</option>)}</select></div>
        <button type="submit" className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-white">Convidar</button>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr><th className="p-3">Nome</th><th className="p-3">Perfil</th><th className="p-3">Situação</th><th className="p-3">Último acesso</th><th className="p-3">Ações</th></tr>
          </thead>
          <tbody>
            {lista.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="p-3"><div className="font-medium">{u.nome}{u.id === meuId && " (você)"}</div><div className="text-xs text-muted-foreground">{u.email}</div></td>
                <td className="p-3">
                  <select aria-label={`Perfil de ${u.nome}`} value={u.perfil} onChange={(e) => mudar(u.id, { perfil: e.target.value })} className={campo}>
                    {PERFIS.map((p) => <option key={p}>{p}</option>)}</select>
                </td>
                <td className="p-3">{!u.ativo ? "Desativado" : u.convitePendente ? "Convite pendente" : "Ativo"}{u.doisFatores && " · 2FA"}</td>
                <td className="p-3 text-xs">{u.ultimoLogin ? new Date(u.ultimoLogin).toLocaleString("pt-BR") : "nunca"}</td>
                <td className="space-x-2 p-3">
                  {u.ativo && <button type="button" className="rounded-md border px-2 py-1 text-xs" onClick={() => gerarLink(u)}>{u.convitePendente ? "Novo convite" : "Link de nova senha"}</button>}
                  <button type="button" className="rounded-md border px-2 py-1 text-xs" onClick={() => mudar(u.id, { ativo: !u.ativo })}>{u.ativo ? "Desativar" : "Reativar"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
