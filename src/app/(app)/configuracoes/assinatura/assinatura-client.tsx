"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Plano = {
  codigo: string; nome: string; descricao: string | null; provisorio: boolean;
  precoMensal: string; precoAnual: string; precoNotaExcedente: string;
  limiteUsuarios: number | null; limiteNotasMes: number | null; limiteProdutos: number | null; modulos: string[];
};
type Resposta = {
  modo: string; mensagem: string | null; cobrancaConfigurada: boolean;
  assinatura: { status: string; ciclo: string; trialFimEm: string | null; proximoVencimento: string | null; plano: { codigo: string; nome: string } } | null;
  uso: {
    usuarios: { usado: number; limite: number | null }; produtos: { usado: number; limite: number | null };
    notasMes: { usado: number; limite: number | null }; excedenteMes: { quantidade: number; precoPorNota: string };
  };
  faturas: { id: string; status: string; valor: number; vencimento: string; link: string | null }[];
  planos: Plano[];
};

const STATUS: Record<string, string> = {
  TRIAL: "Período de teste", ATIVA: "Ativa", INADIMPLENTE: "Pagamento em atraso", SUSPENSA: "Suspensa", CANCELADA: "Cancelada",
};
const brl = (v: string | number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (d: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const lim = (n: number | null) => (n === null ? "sem limite" : String(n));

export function AssinaturaClient() {
  const [d, setD] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ciclo, setCiclo] = useState<"MENSAL" | "ANUAL">("MENSAL");
  const [forma, setForma] = useState("UNDEFINED");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/assinatura");
    const j = await r.json();
    if (!r.ok) return setErro(j.erro ?? "Não foi possível carregar.");
    setD(j);
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  async function chamar(url: string, corpo?: unknown) {
    setOcupado(true); setErro(null); setAviso(null);
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo ?? {}) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Não foi possível concluir.");
      if (j.linkPagamento) setAviso(`Plano escolhido. Pague a primeira fatura: ${j.linkPagamento}`);
      else setAviso("Pronto.");
      await carregar();
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  }

  if (!d) return <p className="text-sm text-muted-foreground">{erro ?? "Carregando…"}</p>;
  const a = d.assinatura;
  return (
    <div className="space-y-6">
      {erro && <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {aviso && <p role="status" className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800 break-all">{aviso}</p>}
      {d.mensagem && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{d.mensagem}</p>}

      <Card>
        <CardHeader><CardTitle>Situação</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div><div className="text-xs text-muted-foreground">Plano</div><div className="font-medium">{a?.plano.nome ?? "—"}</div></div>
          <div><div className="text-xs text-muted-foreground">Situação</div><div className="font-medium">{a ? STATUS[a.status] ?? a.status : "—"}</div></div>
          <div><div className="text-xs text-muted-foreground">Fim do teste</div><div className="font-medium">{data(a?.trialFimEm ?? null)}</div></div>
          <div><div className="text-xs text-muted-foreground">Próximo vencimento</div><div className="font-medium">{data(a?.proximoVencimento ?? null)}</div></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Uso do mês</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>Usuários: {d.uso.usuarios.usado} de {lim(d.uso.usuarios.limite)}</div>
          <div>Produtos: {d.uso.produtos.usado} de {lim(d.uso.produtos.limite)}</div>
          <div>Notas emitidas: {d.uso.notasMes.usado} de {lim(d.uso.notasMes.limite)}</div>
          {d.uso.excedenteMes.quantidade > 0 && (
            <div className="font-medium">
              {d.uso.excedenteMes.quantidade} nota{d.uso.excedenteMes.quantidade === 1 ? "" : "s"} acima do plano neste mês
              {Number(d.uso.excedenteMes.precoPorNota) > 0 ? `, ${brl(d.uso.excedenteMes.precoPorNota)} cada` : ", valor por nota a confirmar"}.
              <span className="font-normal text-muted-foreground"> As notas continuam saindo normalmente.</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Escolher ou trocar de plano</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!d.cobrancaConfigurada && <p className="text-sm text-muted-foreground">A cobrança online ainda não está ligada neste ambiente.</p>}
          <div className="flex flex-wrap gap-4 text-sm">
            <label>Cobrança{" "}
              <select value={ciclo} onChange={(e) => setCiclo(e.target.value as "MENSAL" | "ANUAL")} className="ml-1 h-9 rounded-md border bg-background px-2">
                <option value="MENSAL">Mensal</option><option value="ANUAL">Anual</option>
              </select>
            </label>
            <label>Pagar com{" "}
              <select value={forma} onChange={(e) => setForma(e.target.value)} className="ml-1 h-9 rounded-md border bg-background px-2">
                <option value="UNDEFINED">Escolher na fatura</option><option value="PIX">Pix</option><option value="BOLETO">Boleto</option><option value="CREDIT_CARD">Cartão</option>
              </select>
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {d.planos.map((p) => {
              const preco = Number(ciclo === "ANUAL" ? p.precoAnual : p.precoMensal);
              return (
                <div key={p.codigo} className="rounded-md border p-4 text-sm">
                  <div className="font-semibold">{p.nome}</div>
                  <div className="my-1 text-lg">{preco > 0 ? brl(preco) : "Preço a definir"}</div>
                  <ul className="mb-3 space-y-0.5 text-muted-foreground">
                    <li>Usuários: {lim(p.limiteUsuarios)}</li>
                    <li>Notas por mês: {lim(p.limiteNotasMes)}</li>
                    <li>Produtos: {lim(p.limiteProdutos)}</li>
                    <li>Módulos: {p.modulos.length ? p.modulos.join(", ") : "básico"}</li>
                  </ul>
                  <button
                    disabled={ocupado || preco <= 0 || !d.cobrancaConfigurada || a?.plano.codigo === p.codigo}
                    onClick={() => chamar("/api/assinatura/plano", { planoCodigo: p.codigo, ciclo, forma })}
                    className="h-9 w-full rounded-md bg-accent text-sm font-medium text-accent-foreground disabled:opacity-50"
                  >
                    {a?.plano.codigo === p.codigo ? "Plano atual" : "Escolher este plano"}
                  </button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Faturas</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {d.faturas.length === 0 ? <p className="text-muted-foreground">Nenhuma fatura ainda.</p> : (
            <ul className="divide-y">
              {d.faturas.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2">
                  <span>{data(f.vencimento)} · {brl(f.valor)} · {f.status}</span>
                  {f.link && <a href={f.link} target="_blank" rel="noopener noreferrer" className="underline">Abrir fatura</a>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {a && a.status !== "CANCELADA" && a.plano.codigo !== "INTERNO" && (
        <Card>
          <CardHeader><CardTitle>Cancelar assinatura</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">Cancelar para as cobranças. Seus dados continuam guardados e você pode exportá-los.</p>
            <button
              disabled={ocupado}
              onClick={() => { if (confirm("Cancelar a assinatura? Seus dados não serão apagados.")) void chamar("/api/assinatura/cancelar"); }}
              className="h-9 rounded-md border border-red-300 px-4 font-medium text-red-700 disabled:opacity-50"
            >
              Cancelar assinatura
            </button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
