"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Ações reais sobre as notas: cancelar, carta de correção, baixar XML/DANFE,
// inutilizar numeração e manifestar nota recebida. Tudo chama
// POST /api/fiscal/operacoes (FINANCEIRO ou acima). Confirmação e motivo com
// no mínimo 15 caracteres onde a regra exige (cancelamento, CC-e, inutilização).

export type NotaLinha = {
  id: string;
  numero: string;
  serie: string;
  modelo: "NFE_55" | "NFCE_65" | "SAT_59" | "NFSE";
  cliente: string;
  emissao: string;
  valor: string;
  status: string;
  ambiente: string;
  temChave: boolean;
  mensagem: string | null;
};

const MINIMO = 15;
const MODELO: Record<string, string> = { NFE_55: "NF-e", NFCE_65: "NFC-e", SAT_59: "SAT", NFSE: "NFS-e" };
const STATUS: Record<string, string> = {
  EMITINDO: "Emitindo",
  AUTORIZADA: "Autorizada",
  REJEITADA: "Rejeitada",
  CANCELADA: "Cancelada",
  DENEGADA: "Denegada",
  INUTILIZADA: "Inutilizada",
};

type Acao = { tipo: "cancelar" | "cce"; nota: NotaLinha } | { tipo: "inutilizar" } | { tipo: "manifestar" };

async function operar(corpo: Record<string, unknown>) {
  const r = await fetch("/api/fiscal/operacoes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro ?? "O emissor não aceitou a operação.");
  return j;
}

export function NotasFiscais({ notas, podeOperar }: { notas: NotaLinha[]; podeOperar: boolean }) {
  const router = useRouter();
  const [acao, setAcao] = useState<Acao | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);

  async function baixar(n: NotaLinha) {
    setBaixando(n.id);
    setAviso(null);
    try {
      const j = await operar({ acao: "baixar", notaId: n.id });
      if (j.danfeUrl) window.open(j.danfeUrl, "_blank", "noopener");
      if (j.xmlUrl) window.open(j.xmlUrl, "_blank", "noopener");
    } catch (e) {
      setAviso({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setBaixando(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Notas fiscais</h2>
        {podeOperar && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setAcao({ tipo: "inutilizar" })}>
              Inutilizar numeração
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAcao({ tipo: "manifestar" })}>
              Manifestar nota recebida
            </Button>
          </div>
        )}
      </div>
      {aviso && (
        <p role={aviso.tipo === "erro" ? "alert" : "status"} className={aviso.tipo === "erro" ? "text-sm text-destructive" : "text-sm text-emerald-600"}>
          {aviso.texto}
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Últimas 50 notas fiscais</caption>
          <thead className="border-b bg-secondary text-left">
            <tr>
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Emissão</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Situação</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {notas.map((n) => {
              const autorizada = n.status === "AUTORIZADA";
              return (
                <tr key={n.id} className="border-b align-top hover:bg-secondary/50">
                  <td className="px-4 py-2 font-mono">{n.numero}</td>
                  <td className="px-4 py-2">
                    {MODELO[n.modelo] ?? n.modelo}
                    {n.ambiente === "HOMOLOGACAO" && (
                      <Badge variant="outline" className="ml-1">teste</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2">{n.cliente}</td>
                  <td className="px-4 py-2 text-xs">{n.emissao}</td>
                  <td className="px-4 py-2 text-right font-mono">{n.valor}</td>
                  <td className="px-4 py-2">
                    <Badge
                      variant={
                        autorizada ? "success" : n.status === "CANCELADA" || n.status === "DENEGADA" || n.status === "REJEITADA" ? "destructive" : "warning"
                      }
                    >
                      {STATUS[n.status] ?? n.status}
                    </Badge>
                    {n.status === "REJEITADA" && n.mensagem && (
                      <div className="mt-1 max-w-xs text-xs text-muted-foreground">{n.mensagem}</div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {autorizada || n.status === "CANCELADA" ? (
                      <div className="flex flex-wrap gap-1">
                        {n.temChave && (
                          <Button size="sm" variant="outline" disabled={baixando === n.id} onClick={() => baixar(n)}>
                            {baixando === n.id ? "Abrindo…" : "XML e DANFE"}
                          </Button>
                        )}
                        {podeOperar && autorizada && (
                          <Button size="sm" variant="outline" onClick={() => setAcao({ tipo: "cancelar", nota: n })}>
                            Cancelar
                          </Button>
                        )}
                        {podeOperar && autorizada && n.modelo === "NFE_55" && (
                          <Button size="sm" variant="outline" onClick={() => setAcao({ tipo: "cce", nota: n })}>
                            Carta de correção
                          </Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {notas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  Nenhuma nota emitida ainda. As notas saem das vendas feitas no PDV.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {acao && (
        <DialogoAcao
          acao={acao}
          onFechar={() => setAcao(null)}
          onFeito={(texto) => {
            setAcao(null);
            setAviso({ tipo: "ok", texto });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function DialogoAcao({ acao, onFechar, onFeito }: { acao: Acao; onFechar: () => void; onFeito: (texto: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [motivo, setMotivo] = useState("");
  const [serie, setSerie] = useState("1");
  const [ini, setIni] = useState("");
  const [fim, setFim] = useState("");
  const [chave, setChave] = useState("");
  const [evento, setEvento] = useState("CIENCIA");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const titulo =
    acao.tipo === "cancelar"
      ? `Cancelar nota ${acao.nota.numero}`
      : acao.tipo === "cce"
        ? `Carta de correção da nota ${acao.nota.numero}`
        : acao.tipo === "inutilizar"
          ? "Inutilizar numeração"
          : "Manifestar nota recebida";
  const rotuloMotivo = acao.tipo === "cce" ? "O que está sendo corrigido" : "Motivo";
  const exigeMotivo = acao.tipo !== "manifestar" || evento === "DESCONHECIMENTO" || evento === "OPERACAO_NAO_REALIZADA";
  const falta = MINIMO - motivo.trim().length;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (exigeMotivo && motivo.trim().length < MINIMO) {
      setErro(`Escreva pelo menos ${MINIMO} caracteres. Faltam ${falta}.`);
      return;
    }
    let corpo: Record<string, unknown>;
    let feito = "Feito.";
    if (acao.tipo === "cancelar") {
      corpo = { acao: "cancelar", notaId: acao.nota.id, justificativa: motivo.trim() };
      feito = `Cancelamento da nota ${acao.nota.numero} enviado.`;
    } else if (acao.tipo === "cce") {
      corpo = { acao: "cce", notaId: acao.nota.id, correcao: motivo.trim() };
      feito = `Carta de correção da nota ${acao.nota.numero} enviada.`;
    } else if (acao.tipo === "inutilizar") {
      const a = Number(ini);
      const b = Number(fim);
      if (!serie.trim() || !Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a) {
        setErro("Informe a série e a faixa de números (o final não pode ser menor que o inicial).");
        return;
      }
      corpo = { acao: "inutilizar", serie: serie.trim(), numeroInicial: a, numeroFinal: b, justificativa: motivo.trim() };
      feito = `Inutilização dos números ${a} a ${b} enviada.`;
    } else {
      const c = chave.replace(/\D/g, "");
      if (c.length !== 44) {
        setErro("A chave de acesso tem 44 números.");
        return;
      }
      corpo = { acao: "manifestar", chaveAcesso: c, evento, ...(motivo.trim() && { justificativa: motivo.trim() }) };
      feito = "Manifestação enviada.";
    }
    const confirmacao =
      acao.tipo === "cancelar"
        ? `Cancelar a nota ${acao.nota.numero}? Isso vale perante a Receita e não dá para desfazer.`
        : acao.tipo === "inutilizar"
          ? "Inutilizar essa faixa de números? Não dá para desfazer."
          : "Enviar para a Sefaz?";
    if (!window.confirm(confirmacao)) return;
    setOcupado(true);
    try {
      await operar(corpo);
      onFeito(feito);
    } catch (err) {
      setErro((err as Error).message);
      setOcupado(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onFechar}
      aria-labelledby="dlg-fiscal-titulo"
      className="w-full max-w-lg rounded-lg border bg-card p-0 text-foreground backdrop:bg-black/50"
    >
      <form onSubmit={enviar} className="space-y-3 p-5">
        <h3 id="dlg-fiscal-titulo" className="text-lg font-semibold">
          {titulo}
        </h3>
        {acao.tipo === "cancelar" && (
          <p className="text-sm text-muted-foreground">
            A Sefaz só aceita cancelar dentro do prazo depois da autorização. Se passou do prazo, o emissor devolve
            o motivo e a nota segue valendo; nesse caso o certo é emitir uma nota de devolução.
          </p>
        )}
        {acao.tipo === "cce" && (
          <p className="text-sm text-muted-foreground">
            Serve para corrigir dados que não mudam valor, imposto, quantidade nem o destinatário (por exemplo,
            transportadora ou observações).
          </p>
        )}
        {acao.tipo === "inutilizar" && (
          <div className="grid grid-cols-3 gap-2">
            <Campo id="in-serie" rotulo="Série" valor={serie} onChange={setSerie} />
            <Campo id="in-ini" rotulo="Número inicial" valor={ini} onChange={setIni} numerico autoFocus />
            <Campo id="in-fim" rotulo="Número final" valor={fim} onChange={setFim} numerico />
          </div>
        )}
        {acao.tipo === "manifestar" && (
          <>
            <Campo id="mf-chave" rotulo="Chave de acesso (44 números)" valor={chave} onChange={setChave} numerico autoFocus />
            <div>
              <label htmlFor="mf-evento" className="text-sm font-medium">Resposta</label>
              <select
                id="mf-evento"
                value={evento}
                onChange={(e) => setEvento(e.target.value)}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="CIENCIA">Ciência da operação</option>
                <option value="CONFIRMACAO">Confirmação da operação</option>
                <option value="DESCONHECIMENTO">Desconhecimento da operação</option>
                <option value="OPERACAO_NAO_REALIZADA">Operação não realizada</option>
              </select>
            </div>
          </>
        )}
        <div>
          <label htmlFor="fiscal-motivo" className="text-sm font-medium">
            {rotuloMotivo}
            {!exigeMotivo && " (opcional)"}
          </label>
          <textarea
            id="fiscal-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={255}
            autoFocus={acao.tipo === "cancelar" || acao.tipo === "cce"}
            aria-describedby="fiscal-motivo-ajuda"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p id="fiscal-motivo-ajuda" className="mt-1 text-xs text-muted-foreground">
            {exigeMotivo
              ? falta > 0
                ? `Mínimo de ${MINIMO} caracteres. Faltam ${falta}.`
                : "Pronto."
              : "Obrigatório só para desconhecimento e operação não realizada."}
          </p>
        </div>
        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => ref.current?.close()} disabled={ocupado}>
            Voltar
          </Button>
          <Button type="submit" variant={acao.tipo === "cancelar" ? "destructive" : "accent"} disabled={ocupado}>
            {ocupado ? "Enviando…" : acao.tipo === "cancelar" ? "Cancelar a nota" : acao.tipo === "cce" ? "Enviar correção" : acao.tipo === "inutilizar" ? "Inutilizar" : "Enviar"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

function Campo({
  id, rotulo, valor, onChange, numerico, autoFocus,
}: { id: string; rotulo: string; valor: string; onChange: (v: string) => void; numerico?: boolean; autoFocus?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">{rotulo}</label>
      <Input id={id} value={valor} onChange={(e) => onChange(e.target.value)} inputMode={numerico ? "numeric" : undefined} autoFocus={autoFocus} className="mt-1" />
    </div>
  );
}
