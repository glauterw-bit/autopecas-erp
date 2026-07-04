"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  Clock,
  Lock,
  LockOpen,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "./modal";

// Estado do caixa vindo de GET /api/caixa (nunca traz o esperado
// enquanto a sessão está aberta — fechamento cego).

type Movimento = {
  id: string;
  tipo: "SANGRIA" | "SUPRIMENTO";
  valor: number;
  descricao: string;
  data: string;
};

type Sessao = {
  id: string;
  abertaEm: string;
  valorAbertura: number;
  caixa: { id: string; nome: string; filial: string };
  movimentos: Movimento[];
  totalSangrias: number;
  totalSuprimentos: number;
};

type ResumoFechamento = {
  sessaoId: string;
  abertaEm: string;
  fechadaEm: string;
  valorAbertura: number;
  totalSuprimentos: number;
  totalSangrias: number;
  esperado: number;
  contado: number;
  divergencia: number;
  totaisPorForma: { formaPagamento: string; valor: number }[];
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

async function chamarApi(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.erro ?? "Erro inesperado");
  return json;
}

export function CaixaClient() {
  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<ResumoFechamento | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const json = await chamarApi("/api/caixa");
      setSessao(json.sessao);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (carregando) {
    return <p className="text-sm text-muted-foreground">Carregando estado do caixa…</p>;
  }

  if (resumo) {
    return <ResumoCard resumo={resumo} onNovaSessao={() => { setResumo(null); void recarregar(); }} />;
  }

  return (
    <div className="space-y-6">
      {erro && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600">{erro}</p>
      )}
      {!sessao ? (
        <AberturaCard onAberta={recarregar} />
      ) : (
        <SessaoAbertaCards sessao={sessao} onMudou={recarregar} onFechada={setResumo} />
      )}
    </div>
  );
}

// --- Abertura --------------------------------------------------------------

function AberturaCard({ onAberta }: { onAberta: () => Promise<void> }) {
  const [valor, setValor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function abrir(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(valor.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      setErro("Informe um valor de abertura válido");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      await chamarApi("/api/caixa/abrir", { valorAbertura: n });
      await onAberta();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <LockOpen className="h-4 w-4" /> Abrir caixa
          </span>
          <Badge variant="muted">sem sessão aberta</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={abrir} className="flex max-w-md flex-col gap-3">
          <label className="text-sm text-muted-foreground" htmlFor="valor-abertura">
            Valor de abertura (fundo de troco em dinheiro)
          </label>
          <Input
            id="valor-abertura"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            required
          />
          {erro && <p className="text-xs text-red-500">{erro}</p>}
          <Button type="submit" disabled={enviando}>
            <Wallet className="mr-2 h-4 w-4" />
            {enviando ? "Abrindo…" : "Abrir caixa"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// --- Sessão aberta ----------------------------------------------------------

function SessaoAbertaCards({
  sessao,
  onMudou,
  onFechada,
}: {
  sessao: Sessao;
  onMudou: () => Promise<void>;
  onFechada: (r: ResumoFechamento) => void;
}) {
  const [modal, setModal] = useState<"SANGRIA" | "SUPRIMENTO" | "FECHAR" | null>(null);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Wallet className="h-4 w-4" /> {sessao.caixa.nome} · {sessao.caixa.filial}
            </span>
            <Badge variant="success">aberto</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <Kpi label="Aberto em" valor={hora(sessao.abertaEm)} />
            <Kpi label="Valor de abertura" valor={brl.format(sessao.valorAbertura)} />
            <Kpi label="Suprimentos" valor={brl.format(sessao.totalSuprimentos)} />
            <Kpi label="Sangrias" valor={brl.format(sessao.totalSangrias)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setModal("SANGRIA")}>
              <ArrowDownCircle className="mr-2 h-4 w-4" /> Sangria
            </Button>
            <Button variant="outline" size="sm" onClick={() => setModal("SUPRIMENTO")}>
              <ArrowUpCircle className="mr-2 h-4 w-4" /> Suprimento
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setModal("FECHAR")}>
              <Lock className="mr-2 h-4 w-4" /> Fechar caixa
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" /> Movimentos da sessão
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sessao.movimentos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma sangria ou suprimento nesta sessão.</p>
          ) : (
            <ul className="divide-y">
              {sessao.movimentos.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant={m.tipo === "SANGRIA" ? "destructive" : "success"}>
                      {m.tipo === "SANGRIA" ? "sangria" : "suprimento"}
                    </Badge>
                    <span>{m.descricao}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{hora(m.data)}</span>
                    <span className={`font-medium ${m.tipo === "SANGRIA" ? "text-red-600" : "text-emerald-600"}`}>
                      {m.tipo === "SANGRIA" ? "−" : "+"}
                      {brl.format(m.valor)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {(modal === "SANGRIA" || modal === "SUPRIMENTO") && (
        <MovimentoModal
          tipo={modal}
          onFechar={() => setModal(null)}
          onOk={async () => {
            setModal(null);
            await onMudou();
          }}
        />
      )}
      {modal === "FECHAR" && (
        <FechamentoModal onFechar={() => setModal(null)} onOk={onFechada} />
      )}
    </div>
  );
}

// --- Modal de sangria/suprimento ---------------------------------------------

function MovimentoModal({
  tipo,
  onFechar,
  onOk,
}: {
  tipo: "SANGRIA" | "SUPRIMENTO";
  onFechar: () => void;
  onOk: () => Promise<void>;
}) {
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const titulo = tipo === "SANGRIA" ? "Sangria (retirada de dinheiro)" : "Suprimento (entrada de dinheiro)";

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(valor.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setErro("Informe um valor maior que zero");
      return;
    }
    if (tipo === "SANGRIA" && !descricao.trim()) {
      setErro("Sangria exige uma descrição (motivo da retirada)");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      await chamarApi("/api/caixa/movimento", {
        tipo,
        valor: n,
        descricao: descricao.trim() || undefined,
      });
      await onOk();
    } catch (err) {
      setErro((err as Error).message);
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={titulo} onFechar={onFechar}>
      <form onSubmit={confirmar} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="mov-valor">
            Valor (R$)
          </label>
          <Input
            id="mov-valor"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            autoFocus
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="mov-desc">
            Descrição {tipo === "SANGRIA" ? "(obrigatória)" : "(opcional)"}
          </label>
          <Input
            id="mov-desc"
            placeholder={tipo === "SANGRIA" ? "Ex.: depósito no banco" : "Ex.: reforço de troco"}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            required={tipo === "SANGRIA"}
          />
        </div>
        {erro && <p className="text-xs text-red-500">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={enviando}>
            {enviando ? "Registrando…" : "Confirmar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// --- Fechamento cego -----------------------------------------------------------
// O valor contado é pedido ANTES de qualquer valor esperado aparecer na tela.

function FechamentoModal({
  onFechar,
  onOk,
}: {
  onFechar: () => void;
  onOk: (r: ResumoFechamento) => void;
}) {
  const [contado, setContado] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(contado.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      setErro("Informe o valor contado em dinheiro");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const resumo = (await chamarApi("/api/caixa/fechar", { valorContado: n })) as ResumoFechamento;
      onOk(resumo);
    } catch (err) {
      setErro((err as Error).message);
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Fechamento cego de caixa" onFechar={onFechar}>
      <form onSubmit={confirmar} className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Conte todo o dinheiro da gaveta e informe o total. O valor esperado só será
          exibido depois da confirmação.
        </p>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="valor-contado">
            Valor contado em dinheiro (R$)
          </label>
          <Input
            id="valor-contado"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0,00"
            value={contado}
            onChange={(e) => setContado(e.target.value)}
            autoFocus
            required
          />
        </div>
        {erro && <p className="text-xs text-red-500">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" variant="destructive" size="sm" disabled={enviando}>
            <Lock className="mr-2 h-3 w-3" />
            {enviando ? "Fechando…" : "Fechar caixa"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// --- Resumo do fechamento --------------------------------------------------------

function ResumoCard({ resumo, onNovaSessao }: { resumo: ResumoFechamento; onNovaSessao: () => void }) {
  const zerada = resumo.divergencia === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Banknote className="h-4 w-4" /> Caixa fechado
          </span>
          <Badge variant={zerada ? "success" : "destructive"}>
            {zerada ? "sem divergência" : "com divergência"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div
          className={`rounded-md border p-4 text-center ${
            zerada
              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700"
              : "border-red-500/50 bg-red-500/10 text-red-700"
          }`}
        >
          <div className="text-xs uppercase tracking-wide">Divergência</div>
          <div className="text-3xl font-bold">
            {resumo.divergencia > 0 ? "+" : ""}
            {brl.format(resumo.divergencia)}
          </div>
          <div className="mt-1 text-xs">
            {zerada
              ? "Contado bate com o esperado."
              : resumo.divergencia > 0
                ? "Sobra de caixa: contado acima do esperado."
                : "Falta de caixa: contado abaixo do esperado."}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <Kpi label="Esperado (dinheiro)" valor={brl.format(resumo.esperado)} />
          <Kpi label="Contado" valor={brl.format(resumo.contado)} />
          <Kpi label="Abertura" valor={brl.format(resumo.valorAbertura)} />
          <Kpi
            label="Suprimentos − Sangrias"
            valor={brl.format(resumo.totalSuprimentos - resumo.totalSangrias)}
          />
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">Recebimentos da sessão por forma de pagamento</div>
          {resumo.totaisPorForma.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma venda paga na sessão.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {resumo.totaisPorForma.map((f) => (
                <li key={f.formaPagamento} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>{f.formaPagamento.replace(/_/g, " ")}</span>
                  <span className="font-medium">{brl.format(f.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          Sessão aberta em {hora(resumo.abertaEm)} · fechada em {hora(resumo.fechadaEm)}
        </div>

        <Button onClick={onNovaSessao} variant="outline" size="sm">
          <LockOpen className="mr-2 h-4 w-4" /> Abrir novo caixa
        </Button>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{valor}</div>
    </div>
  );
}
