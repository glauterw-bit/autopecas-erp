"use client";

import { useState } from "react";
import { Plug, RefreshCw, Copy, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Integração Vallente Hub (Mercado Livre)
// O ERP expõe /api/integracoes/vallente/{health,products,orders}; no Vallente
// Hub cadastra-se uma conexão ERP "custom" apontando pra essa URL com a
// X-API-Key gerada aqui. A chave aparece uma única vez.

export function VallenteCard({
  configurada,
  sufixo,
  baseUrl,
}: {
  configurada: boolean;
  sufixo: string | null;
  baseUrl: string;
}) {
  const [chave, setChave] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [ativa, setAtiva] = useState(configurada);

  async function gerar() {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/integracoes/vallente/chave", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro ?? "Falha ao gerar chave");
      setChave(json.chave);
      setAtiva(true);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  async function copiar() {
    if (!chave) return;
    await navigator.clipboard.writeText(chave);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Plug className="h-4 w-4" /> Vallente Hub (Mercado Livre)
          </span>
          <Badge variant={ativa ? "success" : "warning"}>
            {ativa ? `ativa ${sufixo ? `(…${sufixo})` : ""}` : "não configurada"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Sincroniza custo e estoque do ERP com o Mercado Livre e importa as
          vendas do ML como vendas do ERP, via Vallente Hub.
        </p>
        <div className="rounded-md border bg-muted/40 p-3 font-mono text-xs">
          <div>Provider: <b>custom</b> · Header: <b>X-API-Key</b></div>
          <div className="break-all">Base URL: {baseUrl}/api/integracoes/vallente</div>
        </div>
        {chave && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
            <div className="mb-1 text-xs font-medium text-amber-600">
              Copie agora — a chave não será exibida novamente:
            </div>
            <div className="flex items-center gap-2">
              <code className="break-all font-mono text-xs">{chave}</code>
              <Button size="sm" variant="outline" onClick={copiar}>
                {copiado ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        )}
        {erro && <p className="text-xs text-red-500">{erro}</p>}
        <Button onClick={gerar} disabled={carregando} size="sm">
          <RefreshCw className={`mr-2 h-3 w-3 ${carregando ? "animate-spin" : ""}`} />
          {ativa ? "Rotacionar chave" : "Gerar chave de integração"}
        </Button>
      </CardContent>
    </Card>
  );
}
