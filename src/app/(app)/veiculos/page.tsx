import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function VeiculosPage() {
  const montadoras = await prisma.montadora.findMany({
    include: {
      modelos: { include: { _count: { select: { versoes: true } } } },
    },
    orderBy: { nome: "asc" },
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Catálogo veicular</h1>
        <p className="text-muted-foreground">
          Estrutura Montadora → Modelo → Versão (padrão TecDoc/Cinoa).
          Base para a busca por aplicação no PDV.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {montadoras.map((m) => (
          <Card key={m.id}>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-semibold">{m.nome}</div>
                <Badge variant="muted">{m.modelos.length} modelos</Badge>
              </div>
              <div className="space-y-1 text-sm">
                {m.modelos.slice(0, 6).map((mod) => (
                  <div key={mod.id} className="flex items-center justify-between">
                    <span>{mod.nome}</span>
                    <span className="text-xs text-muted-foreground">
                      {mod._count.versoes} versões
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
        {montadoras.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Importe o catálogo (TecDoc) ou rode o seed.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
