import { prisma } from "@/lib/db";
import { empresaAtualId } from "@/lib/sessao";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { maskCpfCnpj } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function FornecedoresPage() {
  const empresaId = await empresaAtualId();
  const fornecedores = await prisma.fornecedor.findMany({
    where: { empresaId },
    orderBy: { razaoSocial: "asc" },
    take: 100,
  });
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Fornecedores</h1>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary text-left">
              <tr>
                <th className="px-4 py-3">Razão Social</th>
                <th className="px-4 py-3">CNPJ</th>
                <th className="px-4 py-3">Contato</th>
                <th className="px-4 py-3 text-right">Pontualidade</th>
              </tr>
            </thead>
            <tbody>
              {fornecedores.map((f) => (
                <tr key={f.id} className="border-b">
                  <td className="px-4 py-2 font-medium">{f.razaoSocial}</td>
                  <td className="px-4 py-2 font-mono text-xs">{maskCpfCnpj(f.cnpjCpf)}</td>
                  <td className="px-4 py-2">{f.email ?? f.telefone ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {f.pontualidade !== null ? (
                      <Badge variant={f.pontualidade > 0.8 ? "success" : "warning"}>
                        {(f.pontualidade * 100).toFixed(0)}%
                      </Badge>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
