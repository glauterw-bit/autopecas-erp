import { prisma } from "@/lib/db";
import { empresaAtualId } from "@/lib/sessao";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, maskCpfCnpj } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const empresaId = await empresaAtualId();
  const clientes = await prisma.cliente.findMany({
    where: { empresaId },
    include: {
      veiculos: { include: { versao: { include: { modelo: { include: { montadora: true } } } } } },
    },
    orderBy: { nome: "asc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Clientes</h1>
        <p className="text-muted-foreground">
          PF e PJ, com garagem de veículos vinculada para sugestão de peças.
        </p>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">CPF/CNPJ</th>
                <th className="px-4 py-3 font-medium">Segmento</th>
                <th className="px-4 py-3 font-medium">Garagem</th>
                <th className="px-4 py-3 text-right font-medium">Crédito</th>
                <th className="px-4 py-3 text-right font-medium">Score IA</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-b hover:bg-secondary/50">
                  <td className="px-4 py-2">
                    <div className="font-medium">{c.nome}</div>
                    <div className="text-xs text-muted-foreground">{c.telefone ?? c.whatsapp ?? ""}</div>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{maskCpfCnpj(c.cpfCnpj)}</td>
                  <td className="px-4 py-2">
                    <Badge variant="muted">{c.segmento.replace("_", " ").toLowerCase()}</Badge>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {c.veiculos.length === 0 ? "—" : c.veiculos.map((v) => (
                      <div key={v.id}>
                        {v.versao?.modelo.montadora.nome} {v.versao?.modelo.nome}
                        {v.placa ? ` · ${v.placa}` : ""}
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{formatBRL(Number(c.limiteCredito))}</td>
                  <td className="px-4 py-2 text-right">
                    {c.scoreCredito ? (
                      <Badge variant={c.scoreCredito >= 0.7 ? "success" : c.scoreCredito >= 0.4 ? "warning" : "destructive"}>
                        {(c.scoreCredito * 100).toFixed(0)}
                      </Badge>
                    ) : "—"}
                  </td>
                </tr>
              ))}
              {clientes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
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
