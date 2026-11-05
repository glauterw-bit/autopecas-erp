import { exigirPerfilPagina } from "@/lib/auth/pagina";
import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/sessao";
import { protegerCliente } from "@/lib/crm/acesso";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, maskCpfCnpj } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  await exigirPerfilPagina("/clientes");
  const usuario = await usuarioAtual();
  const brutos = await prisma.cliente.findMany({
    where: { empresaId: usuario.empresaId },
    include: {
      veiculos: { include: { versao: { include: { modelo: { include: { montadora: true } } } } } },
    },
    orderBy: { nome: "asc" },
    take: 100,
  });
  // LGPD: crédito, score e documento completo só para FINANCEIRO+ ou para quem
  // é responsável pela carteira do cliente.
  const clientes = brutos.map((c) => protegerCliente(usuario, c));
  const algumCredito = clientes.some((c) => c.podeVerCredito);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Clientes</h1>
          <p className="text-muted-foreground">
            PF e PJ, com garagem de veículos. Clique no nome para ver a ficha da oficina.
          </p>
        </div>
        <Link
          href="/clientes/em-risco"
          className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-secondary"
        >
          <PhoneCall className="h-4 w-4" /> Oficinas em risco
        </Link>
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">CPF/CNPJ</th>
                <th className="px-4 py-3 font-medium">Segmento</th>
                <th className="px-4 py-3 font-medium">Garagem</th>
                {algumCredito && <th className="px-4 py-3 text-right font-medium">Crédito</th>}
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-b hover:bg-secondary/50">
                  <td className="px-4 py-2">
                    <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                      {c.nome}
                    </Link>
                    <div className="text-xs text-muted-foreground">{c.telefone ?? c.whatsapp ?? ""}</div>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {c.podeVerCredito ? maskCpfCnpj(c.cpfCnpj) : c.cpfCnpj}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant="muted">{c.segmento.replace(/_/g, " ").toLowerCase()}</Badge>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {c.veiculos.length === 0
                      ? "—"
                      : c.veiculos.map((v) => (
                          <div key={v.id}>
                            {v.versao?.modelo.montadora.nome} {v.versao?.modelo.nome}
                            {v.placa ? ` · ${v.placa}` : ""}
                          </div>
                        ))}
                  </td>
                  {algumCredito && (
                    <td className="px-4 py-2 text-right font-mono">
                      {c.podeVerCredito ? formatBRL(Number(c.limiteCredito)) : "—"}
                    </td>
                  )}
                </tr>
              ))}
              {clientes.length === 0 && (
                <tr>
                  <td colSpan={algumCredito ? 5 : 4} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhum cliente cadastrado.
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
