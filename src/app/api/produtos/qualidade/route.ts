import { limparTermoBusca } from "@/lib/catalogo/busca-normalizar";
import { NextResponse } from "next/server";
import { comAuth } from "@/lib/auth/guard";
import { carregarQualidadeCadastro, filtrarPorProblema } from "@/lib/crm/consultas";

// Painel de qualidade de cadastro (ESTOQUISTA)
// GET ?problema=SEM_NCM|SEM_EAN|EAN_INVALIDO|SEM_APLICACAO|SEM_CODIGO_FABRICANTE|REVISAO|DUPLICADO|NAO_VERIFICADO|TODOS
//     &q=texto (SKU, nome ou código)
export const GET = comAuth("ESTOQUISTA", async (req, _ctx, usuario) => {
  const problema = req.nextUrl.searchParams.get("problema");
  const q = limparTermoBusca(req.nextUrl.searchParams.get("q")).toUpperCase();
  const { resumo, linhas } = await carregarQualidadeCadastro(usuario.empresaId);
  let lista = filtrarPorProblema(linhas, problema);
  if (q) {
    lista = lista.filter((l) =>
      [l.sku, l.nome, l.codigoFabricante, l.codigoOem, l.codigoBarras].some((c) => c?.toUpperCase().includes(q)),
    );
  }
  return NextResponse.json({ resumo, total: lista.length, itens: lista.slice(0, 500) });
});
