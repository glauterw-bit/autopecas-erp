import Link from "next/link";
import { exigirPerfilPagina } from "@/lib/auth/pagina";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/sessao";
import { podePerfil } from "@/lib/auth/config";
import { FormNovoProduto } from "./form";

export const dynamic = "force-dynamic";

export default async function NovoProdutoPage() {
  await exigirPerfilPagina("/produtos/novo");
  const u = await usuarioAtual();
  // Mesma regra da API (POST /api/produtos): estoquista ou acima.
  if (!podePerfil(u.perfil, "ESTOQUISTA")) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Novo produto</h1>
        <p className="text-muted-foreground">
          Seu perfil não pode cadastrar produtos. Peça a quem cuida do estoque ou ao gerente.
        </p>
        <Link href="/produtos" className="text-sm underline">
          Voltar para produtos
        </Link>
      </div>
    );
  }
  const [marcas, categorias] = await Promise.all([
    prisma.marca.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.categoriaPeca.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs text-muted-foreground">
          <Link href="/produtos" className="hover:underline">
            Produtos
          </Link>{" "}
          · Novo
        </div>
        <h1 className="text-3xl font-bold">Novo produto</h1>
        <p className="text-muted-foreground">
          Preencha o que souber. Nome e código interno bastam para começar; a aplicação nos veículos se cadastra
          depois, na ficha do produto.
        </p>
      </div>
      <FormNovoProduto marcas={marcas} categorias={categorias} podeFiscal={podePerfil(u.perfil, "FINANCEIRO")} />
    </div>
  );
}
