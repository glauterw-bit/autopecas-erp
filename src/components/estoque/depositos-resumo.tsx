"use client";

import { useEffect, useState } from "react";
import { Warehouse } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/utils";

type DepositoResumo = {
  id: string;
  nome: string;
  tipo: string;
  ativo: boolean;
  skus: number;
  valorTotal: number;
};

export function DepositosResumo() {
  const [depositos, setDepositos] = useState<DepositoResumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch("/api/estoque/depositos")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.erro ?? "Falha ao carregar depósitos");
        setDepositos(json);
      })
      .catch((e) => setErro((e as Error).message))
      .finally(() => setCarregando(false));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Warehouse className="h-4 w-4" /> Depósitos
        </CardTitle>
      </CardHeader>
      <CardContent>
        {carregando && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {erro && <p className="text-sm text-red-500">{erro}</p>}
        {!carregando && !erro && depositos.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum depósito cadastrado.</p>
        )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {depositos.map((d) => (
            <div key={d.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{d.nome}</span>
                <Badge variant={d.ativo ? "success" : "muted"}>
                  {d.tipo.replace(/_/g, " ").toLowerCase()}
                </Badge>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{d.skus} SKUs</span>
                <span className="font-medium text-foreground">{formatBRL(d.valorTotal)}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
