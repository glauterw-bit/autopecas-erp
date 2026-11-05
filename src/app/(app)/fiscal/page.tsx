import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/sessao";
import { podePerfil } from "@/lib/auth/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL, formatDateTime } from "@/lib/utils";
import { NotasFiscais } from "@/components/fiscal/notas-fiscais";
import { ArquivosContador } from "@/components/fiscal/arquivos-contador";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  EMITINDO: "Emitindo",
  AUTORIZADA: "Autorizadas",
  REJEITADA: "Rejeitadas",
  CANCELADA: "Canceladas",
  DENEGADA: "Denegadas",
  INUTILIZADA: "Inutilizadas",
};

// Rotinas que existem no sistema, mas ainda não têm tela própria.
const SEM_TELA = [
  "Virada da ST de autopeças em SP: relatório do estoque de 30/09 para o contador",
  "Nota de devolução referenciada (sai pela devolução da venda)",
  "NFS-e de serviços da oficina",
  "MDF-e e CT-e",
  "Apuração do Simples Nacional (PGDAS-D)",
];

export default async function FiscalPage() {
  const u = await usuarioAtual();
  const empresaId = u.empresaId;
  const [notas, contagem] = await Promise.all([
    prisma.notaFiscal.findMany({
      where: { empresaId },
      include: { cliente: { select: { nome: true } } },
      orderBy: { dataEmissao: "desc" },
      take: 50,
    }),
    prisma.notaFiscal.groupBy({ by: ["status"], where: { empresaId }, _count: { _all: true } }),
  ]);
  const podeOperar = podePerfil(u.perfil, "FINANCEIRO");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Fiscal</h1>
        <p className="text-muted-foreground">
          Notas emitidas, cancelamento, carta de correção, inutilização e arquivos para o contador.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {contagem.map((c) => (
          <Card key={c.status}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{STATUS[c.status] ?? c.status}</div>
              <div className="text-2xl font-bold">{c._count._all}</div>
            </CardContent>
          </Card>
        ))}
        {contagem.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">Ainda não há notas para contar.</p>
        )}
      </div>

      {!podeOperar && (
        <p className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">
          Seu perfil só consulta as notas. Cancelar e corrigir exige perfil financeiro ou acima.
        </p>
      )}

      <NotasFiscais
        podeOperar={podeOperar}
        notas={notas.map((n) => ({
          id: n.id,
          numero: String(n.numero).padStart(6, "0"),
          serie: n.serie,
          modelo: n.modelo,
          cliente: n.cliente?.nome ?? "Consumidor",
          emissao: formatDateTime(n.dataEmissao),
          valor: formatBRL(Number(n.valorTotal)),
          status: n.status,
          ambiente: n.ambiente,
          temChave: Boolean(n.chaveAcesso),
          mensagem: n.mensagemSefaz,
        }))}
      />

      {podeOperar && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Arquivos para o contador</CardTitle>
          </CardHeader>
          <CardContent>
            <ArquivosContador />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ainda sem tela</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-sm text-muted-foreground">
            Estas rotinas já existem no sistema, mas hoje só rodam por fora da tela. Fale com o suporte se precisar.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {SEM_TELA.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
