import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { usuarioAtual } from "@/lib/sessao";
import { podePerfil } from "@/lib/auth/config";
import { carregarOficinasEmRisco } from "@/lib/crm/consultas";
import { centavosParaReais } from "@/lib/crm/dinheiro";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate } from "@/lib/utils";
import { BotaoContato } from "../acoes-crm";

export const dynamic = "force-dynamic";

export default async function OficinasEmRiscoPage({
  searchParams,
}: {
  searchParams: Promise<{ minhas?: string; atencao?: string }>;
}) {
  const sp = await searchParams;
  const usuario = await usuarioAtual();
  if (!podePerfil(usuario.perfil, "VENDEDOR")) {
    return <p className="text-muted-foreground">Seu perfil não tem acesso à carteira de clientes.</p>;
  }
  const minhas = sp.minhas === "1";
  const atencao = sp.atencao === "1";
  const lista = await carregarOficinasEmRisco(usuario.empresaId, {
    incluirAtencao: atencao,
    somenteVendedorId: minhas ? usuario.id : undefined,
  });
  const seteDias = Date.now() - 7 * 86_400_000;
  const link = (m: boolean, a: boolean) =>
    `/clientes/em-risco?${new URLSearchParams({ ...(m ? { minhas: "1" } : {}), ...(a ? { atencao: "1" } : {}) })}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <PhoneCall className="h-6 w-6" /> Oficinas em risco
        </h1>
        <p className="text-muted-foreground">
          Clientes que passaram de 1,5 vez o próprio intervalo de compra. Ligue, pergunte o que precisam e registre o contato.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={link(!minhas, atencao)} className={`rounded-full border px-3 py-1 ${minhas ? "border-accent bg-accent text-white" : "hover:bg-secondary"}`}>
          Só minha carteira
        </Link>
        <Link href={link(minhas, !atencao)} className={`rounded-full border px-3 py-1 ${atencao ? "border-accent bg-accent text-white" : "hover:bg-secondary"}`}>
          Incluir “atenção”
        </Link>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Ritmo</th>
                <th className="px-4 py-3 text-right font-medium">Ticket médio</th>
                <th className="px-4 py-3 font-medium">Último contato</th>
                <th className="px-4 py-3 font-medium"><span className="sr-only">Ação</span></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((o) => {
                const contatadoRecente = o.ultimoContatoEm && o.ultimoContatoEm.getTime() >= seteDias;
                return (
                  <tr key={o.id} className="border-b align-top hover:bg-secondary/50">
                    <td className="px-4 py-2">
                      <Link href={`/clientes/${o.id}`} className="font-medium hover:underline">
                        {o.nome}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {o.whatsapp ?? o.telefone ?? "sem telefone"}
                        {o.vendedorResponsavelNome && ` · ${o.vendedorResponsavelNome}`}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={o.churn.situacao === "EM_RISCO" ? "destructive" : "warning"}>
                        {o.churn.situacao === "EM_RISCO" ? "Em risco" : "Atenção"}
                      </Badge>
                      <div className="mt-1 text-xs">{o.churn.mensagem}</div>
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{formatBRL(centavosParaReais(o.ticketMedioCentavos))}</td>
                    <td className="px-4 py-2 text-xs">
                      {o.ultimoContatoEm ? (
                        <span className={contatadoRecente ? "text-emerald-600" : "text-muted-foreground"}>
                          {formatDate(o.ultimoContatoEm)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">nunca</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <BotaoContato clienteId={o.id} compacto />
                    </td>
                  </tr>
                );
              })}
              {lista.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhuma oficina em risco agora. O alerta precisa de pelo menos 3 compras para conhecer o ritmo do cliente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
