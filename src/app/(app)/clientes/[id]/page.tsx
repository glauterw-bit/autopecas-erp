import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Lock } from "lucide-react";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/sessao";
import { podePerfil } from "@/lib/auth/config";
import { carregarFichaCliente } from "@/lib/crm/consultas";
import { centavosParaReais } from "@/lib/crm/dinheiro";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate, maskCpfCnpj } from "@/lib/utils";
import { BotaoContato, CondicoesCliente } from "../acoes-crm";

export const dynamic = "force-dynamic";

const SITUACAO = {
  SEM_HISTORICO: { rotulo: "Sem ritmo ainda", cor: "muted" },
  EM_DIA: { rotulo: "Em dia", cor: "success" },
  ATENCAO: { rotulo: "Atenção", cor: "warning" },
  EM_RISCO: { rotulo: "Em risco", cor: "destructive" },
} as const;

export default async function FichaClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await usuarioAtual();
  if (!podePerfil(usuario.perfil, "VENDEDOR")) {
    return <p className="text-muted-foreground">Seu perfil não tem acesso à ficha de clientes.</p>;
  }
  const ficha = await carregarFichaCliente(usuario.empresaId, id, usuario);
  if (!ficha) notFound();
  const podeCarteira = podePerfil(usuario.perfil, "GERENTE");
  const podeCondicoes = podePerfil(usuario.perfil, "FINANCEIRO");
  const vendedores = podeCarteira
    ? await prisma.usuario.findMany({
        where: { empresaId: usuario.empresaId, ativo: true, perfil: { in: ["VENDEDOR", "GERENTE", "ADMIN"] } },
        select: { id: true, nome: true },
        orderBy: { nome: "asc" },
      })
    : [];
  const s = SITUACAO[ficha.churn.situacao];
  const m = ficha.metricas;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">
            <Link href="/clientes" className="hover:underline">Clientes</Link> ·{" "}
            <Link href="/clientes/em-risco" className="hover:underline">Oficinas em risco</Link>
          </div>
          <h1 className="text-2xl font-bold">{ficha.nome}</h1>
          <p className="text-sm text-muted-foreground">
            {ficha.apelido && `${ficha.apelido} · `}
            {ficha.segmento.replace(/_/g, " ").toLowerCase()} ·{" "}
            {ficha.podeVerCredito ? maskCpfCnpj(ficha.documento) : ficha.documento}
            {ficha.municipio && ` · ${ficha.municipio}/${ficha.uf ?? ""}`}
          </p>
          <p className="text-sm">
            {ficha.whatsapp ?? ficha.telefone ?? "Sem telefone"}
            {ficha.vendedorResponsavel && (
              <span className="text-muted-foreground"> · carteira de {ficha.vendedorResponsavel.nome}</span>
            )}
          </p>
        </div>
        <BotaoContato clienteId={ficha.id} />
      </div>

      <Card className={ficha.churn.situacao === "EM_RISCO" ? "border-destructive/50" : ""}>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          {ficha.churn.situacao === "EM_RISCO" && <AlertTriangle className="h-5 w-5 text-destructive" />}
          <Badge variant={s.cor}>{s.rotulo}</Badge>
          <span className="text-sm">{ficha.churn.mensagem}</span>
          {ficha.ultimoContatoEm && (
            <span className="text-xs text-muted-foreground">
              Último contato: {formatDate(ficha.ultimoContatoEm)}
              {ficha.ultimoContatoNota && ` — ${ficha.ultimoContatoNota}`}
            </span>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { t: "Última compra", v: ficha.churn.ultimaCompra ? formatDate(ficha.churn.ultimaCompra) : "—", s: ficha.churn.diasSemComprar !== null ? `há ${ficha.churn.diasSemComprar} dia(s)` : "nunca comprou" },
          { t: "Frequência média", v: m.frequenciaMediaDias ? `${Math.round(m.frequenciaMediaDias)} dias` : "—", s: `${ficha.churn.visitas} visita(s) de compra` },
          { t: "Ticket médio", v: formatBRL(centavosParaReais(m.ticketMedioCentavos)), s: `${m.compras} venda(s) concluída(s)` },
          { t: "Total comprado", v: formatBRL(centavosParaReais(m.totalCentavos)), s: "últimos 18 meses e antes" },
        ].map((c) => (
          <Card key={c.t}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{c.t}</div>
              <div className="text-xl font-bold">{c.v}</div>
              <div className="text-xs text-muted-foreground">{c.s}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Crédito e prazo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ficha.credito ? (
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Limite</dt>
                <dd className="text-right font-mono">{formatBRL(centavosParaReais(ficha.credito.limiteCentavos))}</dd>
                <dt className="text-muted-foreground">Em aberto</dt>
                <dd className="text-right font-mono">{formatBRL(centavosParaReais(ficha.credito.saldoDevedorCentavos))}</dd>
                <dt className="text-muted-foreground">Disponível</dt>
                <dd className="text-right font-mono">{formatBRL(centavosParaReais(ficha.credito.disponivelCentavos))}</dd>
                <dt className="text-muted-foreground">Vencido</dt>
                <dd className={`text-right font-mono ${ficha.credito.emAtrasoCentavos > 0 ? "text-destructive" : ""}`}>
                  {formatBRL(centavosParaReais(ficha.credito.emAtrasoCentavos))}
                </dd>
                <dt className="text-muted-foreground">Prazo combinado</dt>
                <dd className="text-right">{ficha.prazoPagamentoDias ? `${ficha.prazoPagamentoDias} dias` : "à vista"}</dd>
                {ficha.credito.bloqueado && (
                  <dd className="col-span-2 text-sm text-destructive">Cliente bloqueado para crédito.</dd>
                )}
              </dl>
            ) : (
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <Lock className="mt-0.5 h-4 w-4" />
                <span>
                  Crédito e documento completo aparecem só para o financeiro, a gerência ou quem cuida desta carteira.
                  {ficha.prazoPagamentoDias ? ` Prazo combinado: ${ficha.prazoPagamentoDias} dias.` : ""}
                </span>
              </div>
            )}
            <CondicoesCliente
              clienteId={ficha.id}
              prazoPagamentoDias={ficha.prazoPagamentoDias}
              limiteCredito={ficha.credito ? centavosParaReais(ficha.credito.limiteCentavos) : null}
              vendedorResponsavelId={ficha.vendedorResponsavel?.id ?? null}
              podeCondicoes={podeCondicoes}
              podeCarteira={podeCarteira}
              vendedores={vendedores}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Últimas compras</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {ficha.ultimasCompras.map((v) => (
                  <tr key={v.id} className="border-t">
                    <td className="px-4 py-2">#{v.numero}</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatDate(v.data)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{v.itens} item(ns)</td>
                    <td className="px-4 py-2 text-right font-mono">{formatBRL(centavosParaReais(v.totalCentavos))}</td>
                  </tr>
                ))}
                {ficha.ultimasCompras.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground">Nenhuma venda concluída ainda.</td>
                  </tr>
                )}
              </tbody>
            </table>
            {ficha.categoriasParadas.length > 0 && (
              <div className="border-t p-4 text-sm">
                <div className="font-medium">Deixou de comprar (há mais de 90 dias)</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {ficha.categoriasParadas.map((c) => (
                    <Badge key={c.nome} variant="outline">
                      {c.nome} · {formatDate(c.ultima)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {ficha.veiculos.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Veículos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm">
            {ficha.veiculos.map((v) => (
              <Badge key={v.id} variant="muted">
                {v.descricao ?? "Veículo"} {v.ano ?? ""} {v.placa ? `· ${v.placa}` : ""}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
