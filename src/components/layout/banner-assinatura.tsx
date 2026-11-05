import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { acessoDaEmpresa, resumoDeUso } from "@/lib/assinatura/politica";

// Faixa de aviso no topo das telas: teste acabando, atraso de pagamento,
// limite de notas. Nunca bloqueia nada; se a consulta falhar, não aparece.
export async function BannerAssinatura({ empresaId, admin }: { empresaId: string; admin: boolean }) {
  let mensagens: string[] = [];
  let grave = false;
  try {
    const acesso = await acessoDaEmpresa(empresaId);
    if (acesso.mensagem) mensagens.push(acesso.mensagem);
    grave = acesso.modo === "SOMENTE_LEITURA";
    const uso = await resumoDeUso(empresaId);
    if (uso.avisoNotas?.aviso) mensagens.push(uso.avisoNotas.aviso);
  } catch {
    mensagens = [];
  }
  if (mensagens.length === 0) return null;
  return (
    <div
      role="status"
      className={`mb-4 flex items-start gap-3 rounded-md border p-3 text-sm ${grave ? "border-red-300 bg-red-50 text-red-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        {mensagens.map((m) => (
          <p key={m}>{m}</p>
        ))}
        {admin && (
          <Link href="/configuracoes/assinatura" className="font-medium underline">
            Ver assinatura
          </Link>
        )}
      </div>
    </div>
  );
}
