import { redirect } from "next/navigation";
import { Car, Plus } from "lucide-react";
import { clienteAtualB2B } from "@/lib/b2b/sessao";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function GaragemB2B() {
  const cliente = await clienteAtualB2B();
  if (!cliente) redirect("/b2b/login");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Minha garagem</h1>
        <button className="flex items-center gap-1 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white">
          <Plus className="h-4 w-4" /> Adicionar veículo
        </button>
      </div>

      {cliente.veiculos.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Car className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Cadastre seus veículos para receber sugestões de peças compatíveis.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {cliente.veiculos.map((v) => (
            <Card key={v.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-md bg-accent/10 text-accent">
                    <Car className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold">
                      {v.versao?.modelo.montadora.nome} {v.versao?.modelo.nome}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {v.versao?.descricao} · {v.ano ?? "—"}/{v.anoModelo ?? "—"}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {v.placa && <Badge variant="muted">{v.placa}</Badge>}
                      {v.cor && <Badge variant="outline">{v.cor}</Badge>}
                      {v.kmAtual && <Badge variant="outline">{v.kmAtual.toLocaleString("pt-BR")} km</Badge>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
