import { exigirPerfilPagina } from "@/lib/auth/pagina";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/sessao";
import { podePerfil } from "@/lib/auth/config";
import { Badge } from "@/components/ui/badge";
import { problemasDoProduto, ROTULO_PROBLEMA } from "@/lib/crm/qualidade-cadastro";
import { formatDateTime } from "@/lib/utils";
import { EditorCadastro } from "./editor";
import { AplicacoesProduto } from "./aplicacoes";

export const dynamic = "force-dynamic";

const POSICAO: Record<string, string> = {
  DIANTEIRA: "dianteira",
  TRASEIRA: "traseira",
  LADO_DIREITO: "lado direito",
  LADO_ESQUERDO: "lado esquerdo",
};

export default async function ProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPerfilPagina("/produtos");
  const { id } = await params;
  const u = await usuarioAtual();
  const empresaId = u.empresaId;
  const p = await prisma.produto.findFirst({
    where: { id, empresaId },
    include: {
      marca: { select: { nome: true } },
      aplicacoes: {
        include: { versao: { include: { modelo: { include: { montadora: true } } } } },
      },
    },
  });
  if (!p) notFound();
  const problemas = problemasDoProduto({ ...p, qtdAplicacoes: p.aplicacoes.length });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">
            <Link href="/produtos" className="hover:underline">Produtos</Link> ·{" "}
            <Link href="/produtos/qualidade" className="hover:underline">Qualidade do cadastro</Link>
          </div>
          <h1 className="text-2xl font-bold">{p.nome}</h1>
          <p className="text-sm text-muted-foreground">
            SKU {p.sku}
            {p.marca && ` · ${p.marca.nome}`} · curva {p.curva}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {problemas.length === 0 ? (
            <Badge variant="success">Cadastro completo</Badge>
          ) : (
            problemas.map((pr) => (
              <Badge key={pr} variant={pr === "REVISAO" ? "warning" : "outline"}>
                {ROTULO_PROBLEMA[pr]}
              </Badge>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <EditorCadastro
          produto={{
            id: p.id,
            nome: p.nome,
            codigoBarras: p.codigoBarras ?? "",
            codigoFabricante: p.codigoFabricante ?? "",
            codigoOem: p.codigoOem ?? "",
            ncm: p.ncm ?? "",
            localizacao: p.localizacao ?? "",
            qtdAplicacoes: p.aplicacoes.length,
            aplicacaoVerificadaEm: p.aplicacaoVerificadaEm?.toISOString() ?? null,
            aplicacaoVerificadaPorNome: p.aplicacaoVerificadaPorNome,
            revisaoCadastro: p.revisaoCadastro,
            revisaoCadastroMotivo: p.revisaoCadastroMotivo,
            revisaoCadastroEm: p.revisaoCadastroEm?.toISOString() ?? null,
          }}
        />

        <AplicacoesProduto
          produtoId={p.id}
          podeEditar={podePerfil(u.perfil, "ESTOQUISTA")}
          seloAtivo={Boolean(p.aplicacaoVerificadaEm)}
          aplicacoes={p.aplicacoes.map((a) => ({
            id: a.id,
            titulo: `${a.versao.modelo.montadora.nome} ${a.versao.modelo.nome} ${a.versao.descricao}`,
            detalhe: [
              `${a.versao.anoInicio ?? "?"}–${a.versao.anoFim ?? "atual"}`,
              a.versao.motor && `motor ${a.versao.motor}`,
              a.posicao && (POSICAO[a.posicao] ?? a.posicao.toLowerCase().replace(/_/g, " ")),
              a.quantidadePorVeiculo > 1 && `${a.quantidadePorVeiculo} por veículo`,
              a.observacao,
            ]
              .filter(Boolean)
              .join(" · "),
          }))}
        />
      </div>
      <p className="text-xs text-muted-foreground">Atualizado em {formatDateTime(p.atualizadoEm)}.</p>
    </div>
  );
}
