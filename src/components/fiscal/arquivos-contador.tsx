"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Input } from "@/components/ui/input";

// Arquivos mensais para o contador (SPED). O download usa a rota que já existe
// (FINANCEIRO ou acima); o navegador baixa o .txt direto.

function mesAtual() {
  const d = new Date();
  return { de: new Date(d.getFullYear(), d.getMonth(), 1), ate: d };
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function ArquivosContador() {
  const ini = mesAtual();
  const [de, setDe] = useState(iso(ini.de));
  const [ate, setAte] = useState(iso(ini.ate));
  const invalido = !de || !ate || de > ate;
  const qs = `inicio=${de}&fim=${ate}`;
  const link = "inline-flex h-10 items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="sped-de" className="text-sm font-medium">De</label>
          <Input id="sped-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} className="mt-1 w-44" />
        </div>
        <div>
          <label htmlFor="sped-ate" className="text-sm font-medium">Até</label>
          <Input id="sped-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="mt-1 w-44" />
        </div>
        {invalido ? (
          <span role="alert" className="text-sm text-destructive">A data inicial precisa ser antes da final.</span>
        ) : (
          <>
            <a className={link} href={`/api/contabil/sped?tipo=EFD&${qs}`}>
              <Download className="h-4 w-4" /> SPED Fiscal (ICMS/IPI)
            </a>
            <a className={link} href={`/api/contabil/sped-contribuicoes?${qs}`}>
              <Download className="h-4 w-4" /> SPED Contribuições (PIS/COFINS)
            </a>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Envie ao contador para conferir antes de entregar à Receita. O sistema não transmite o arquivo.
      </p>
    </div>
  );
}
