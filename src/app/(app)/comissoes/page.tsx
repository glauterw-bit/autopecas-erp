import { prisma } from "@/lib/db";
import { empresaAtualId } from "@/lib/sessao";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ComissoesPage() {
  const empresaId = await empresaAtualId();
  const hoje = new Date();
  const competencia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  const apuracoes = await prisma.apuracaoComissao.findMany({
    where: { empresaId },
    orderBy: [{ competencia: "desc" }, { valorComissao: "desc" }],
    take: 50,
  });
  const vendedores = await prisma.usuario.findMany({
    where: { empresaId },
    select: { id: true, nome: true },
  });
  const byId = new Map(vendedores.map((v) => [v.id, v.nome]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Comissionamento</h1>
        <p className="text-muted-foreground">
          Apuração mensal por vendedor. Suporta % sobre venda, % sobre margem,
          escalonado e fixo por pedido. Aplica overrides por categoria/marca.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary text-left">
              <tr>
                <th className="px-4 py-3">Vendedor</th>
                <th className="px-4 py-3">Competência</th>
                <th className="px-4 py-3 text-right">Vendido</th>
                <th className="px-4 py-3 text-right">Margem</th>
                <th className="px-4 py-3 text-right">Atingimento</th>
                <th className="px-4 py-3 text-right">Comissão</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {apuracoes.map((a) => {
                const ating = a.atingimento ? Number(a.atingimento) : 0;
                return (
                  <tr key={a.id} className="border-b hover:bg-secondary/50">
                    <td className="px-4 py-2 font-medium">{byId.get(a.vendedorId) ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs">{a.competencia}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatBRL(Number(a.totalVendido))}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatBRL(Number(a.totalMargem))}</td>
                    <td className="px-4 py-2 text-right">
                      {ating > 0 && (
                        <Badge variant={ating >= 1 ? "success" : ating >= 0.7 ? "warning" : "muted"}>
                          {(ating * 100).toFixed(0)}%
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-semibold">
                      {formatBRL(Number(a.valorComissao) + Number(a.bonificacao))}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={a.pago ? "success" : "warning"}>
                        {a.pago ? "pago" : "aberto"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
              {apuracoes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    Sem apurações ainda. POST /api/comissoes com {`{"competencia":"${competencia}"}`} para gerar.
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
