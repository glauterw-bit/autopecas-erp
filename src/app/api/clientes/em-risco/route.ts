import { NextResponse } from "next/server";
import { comAuth } from "@/lib/auth/guard";
import { carregarOficinasEmRisco } from "@/lib/crm/consultas";
import { centavosParaReais } from "@/lib/crm/dinheiro";

// Oficinas em risco (VENDEDOR): clientes B2B que passaram de 1,5× o próprio
// intervalo de compra. ?minhas=1 → só a carteira de quem está logado;
// ?atencao=1 → inclui quem passou da média mas ainda não de 1,5×.
// Não devolve crédito nem documento (LGPD) — só o necessário para ligar.
export const GET = comAuth("VENDEDOR", async (req, _ctx, usuario) => {
  const minhas = req.nextUrl.searchParams.get("minhas") === "1";
  const atencao = req.nextUrl.searchParams.get("atencao") === "1";
  const lista = await carregarOficinasEmRisco(usuario.empresaId, {
    incluirAtencao: atencao,
    somenteVendedorId: minhas ? usuario.id : undefined,
  });
  return NextResponse.json(
    lista.map((o) => ({
      id: o.id,
      nome: o.nome,
      apelido: o.apelido,
      segmento: o.segmento,
      telefone: o.telefone,
      whatsapp: o.whatsapp,
      vendedorResponsavel: o.vendedorResponsavelNome,
      ultimoContatoEm: o.ultimoContatoEm,
      situacao: o.churn.situacao,
      mensagem: o.churn.mensagem,
      intervaloMedioDias: o.churn.intervaloMedioDias,
      diasSemComprar: o.churn.diasSemComprar,
      ultimaCompra: o.churn.ultimaCompra,
      ticketMedio: centavosParaReais(o.ticketMedioCentavos),
    })),
  );
});
