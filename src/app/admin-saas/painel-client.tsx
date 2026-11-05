"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Loja = {
  empresaId: string; razaoSocial: string; cidade: string | null; plano: string; status: string;
  trialFimEm: string | null; ultimoAcesso: string | null; inadimplenteDesde: string | null; suspensaMotivo: string | null;
};
const data = (d: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export function PainelClient({ lojas, planos }: { lojas: Loja[]; planos: { codigo: string; nome: string }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  async function agir(corpo: Record<string, unknown>) {
    setMsg(null);
    const r = await fetch("/api/admin-saas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
    const j = await r.json();
    setMsg(r.ok ? "Feito." : j.erro ?? "Não foi possível.");
    if (r.ok) router.refresh();
  }

  return (
    <div className="space-y-3">
      {msg && <p role="status" className="rounded-md border bg-card p-3 text-sm">{msg}</p>}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left"><tr>
            {["Loja", "Plano", "Situação", "Fim do teste", "Último acesso", "Ações"].map((h) => <th key={h} className="p-2">{h}</th>)}
          </tr></thead>
          <tbody>
            {lojas.map((l) => (
              <tr key={l.empresaId} className="border-t align-top">
                <td className="p-2"><div className="font-medium">{l.razaoSocial}</div><div className="text-xs text-muted-foreground">{l.cidade ?? ""}</div></td>
                <td className="p-2">
                  <select value={l.plano} onChange={(e) => agir({ acao: "MUDAR_PLANO", empresaId: l.empresaId, planoCodigo: e.target.value })} className="h-8 rounded-md border bg-background px-1">
                    {planos.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome}</option>)}
                  </select>
                </td>
                <td className="p-2">{l.status}{l.suspensaMotivo ? ` (${l.suspensaMotivo})` : ""}</td>
                <td className="p-2">{data(l.trialFimEm)}</td>
                <td className="p-2">{data(l.ultimoAcesso)}</td>
                <td className="space-x-2 p-2">
                  {l.status === "TRIAL" && <button className="underline" onClick={() => agir({ acao: "ESTENDER_TRIAL", empresaId: l.empresaId, dias: 7 })}>+7 dias de teste</button>}
                  {l.status !== "SUSPENSA" ? (
                    <button className="underline" onClick={() => {
                      const motivo = prompt("Motivo da suspensão?");
                      if (!motivo) return;
                      const forcar = confirm("Forçar mesmo se o atraso for curto? (OK = forçar, Cancelar = respeitar a regra)");
                      void agir({ acao: "SUSPENDER", empresaId: l.empresaId, motivo, forcar });
                    }}>Suspender</button>
                  ) : (
                    <button className="underline" onClick={() => agir({ acao: "REATIVAR", empresaId: l.empresaId })}>Reativar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
