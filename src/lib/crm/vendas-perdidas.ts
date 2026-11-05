import { normalizarCodigo } from "./qualidade-cadastro";

// Relatório de vendas perdidas
// ============================
// Agrupa por produto (quando vinculado) ou pelo texto pedido normalizado e
// sugere a ação. A sugestão de compra é sugestão: quem compra decide.

export const MOTIVOS_VENDA_PERDIDA = ["SEM_ESTOQUE", "PRECO", "PRAZO_ENTREGA", "NAO_TRABALHAMOS", "OUTRO"] as const;
export type MotivoVendaPerdida = (typeof MOTIVOS_VENDA_PERDIDA)[number];

export const ROTULO_MOTIVO_PERDA: Record<MotivoVendaPerdida, string> = {
  SEM_ESTOQUE: "Sem estoque",
  PRECO: "Preço",
  PRAZO_ENTREGA: "Prazo",
  NAO_TRABALHAMOS: "Não trabalhamos",
  OUTRO: "Outro",
};

/** Mínimo de pedidos para sugerir incluir no mix um item que a loja não trabalha (hipótese a calibrar). */
export const MIN_PEDIDOS_MIX = 3;

export interface RegistroPerda {
  produtoId: string | null;
  descricaoBuscada: string;
  quantidade: number;
  motivo: MotivoVendaPerdida;
  criadoEm: Date;
}

export interface ProdutoEstoque {
  nome: string;
  sku: string;
  estoque: number;
  estoqueMinimo: number;
}

export interface GrupoPerda {
  chave: string;
  produtoId: string | null;
  descricao: string;
  ocorrencias: number;
  quantidade: number;
  porMotivo: Record<MotivoVendaPerdida, number>;
  ultima: Date;
  sugestao: string;
  comprarQtd: number;
}

function chaveTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function sugerirAcao(g: Omit<GrupoPerda, "sugestao" | "comprarQtd">, prod?: ProdutoEstoque): { sugestao: string; comprarQtd: number } {
  const faltaEstoque = g.porMotivo.SEM_ESTOQUE + g.porMotivo.PRAZO_ENTREGA;
  if (prod && faltaEstoque > 0) {
    const comprar = Math.ceil(faltaEstoque + prod.estoqueMinimo - Math.max(0, prod.estoque));
    if (comprar > 0) return { sugestao: `Comprar ${comprar} un (perdeu ${faltaEstoque} por falta/prazo)`, comprarQtd: comprar };
    return { sugestao: "Estoque já reposto — conferir ponto de pedido", comprarQtd: 0 };
  }
  const ocorrPorMotivo = g.porMotivo;
  const maior = (Object.keys(ocorrPorMotivo) as MotivoVendaPerdida[]).sort(
    (a, b) => ocorrPorMotivo[b] - ocorrPorMotivo[a],
  )[0];
  if (maior === "PRECO") return { sugestao: "Rever preço (cliente achou caro)", comprarQtd: 0 };
  if (!prod && g.ocorrencias >= MIN_PEDIDOS_MIX) {
    return { sugestao: `Avaliar cadastrar e trabalhar com o item (pedido ${g.ocorrencias} vezes)`, comprarQtd: 0 };
  }
  if (!prod && faltaEstoque > 0) return { sugestao: "Vincular a um produto do cadastro para sugerir compra", comprarQtd: 0 };
  return { sugestao: "Acompanhar", comprarQtd: 0 };
}

export function agruparVendasPerdidas(
  registros: RegistroPerda[],
  produtos: Map<string, ProdutoEstoque> = new Map(),
): GrupoPerda[] {
  const grupos = new Map<string, Omit<GrupoPerda, "sugestao" | "comprarQtd">>();
  for (const r of registros) {
    const chave = r.produtoId ? `P:${r.produtoId}` : `T:${chaveTexto(r.descricaoBuscada) || normalizarCodigo(r.descricaoBuscada)}`;
    let g = grupos.get(chave);
    if (!g) {
      const prod = r.produtoId ? produtos.get(r.produtoId) : undefined;
      g = {
        chave,
        produtoId: r.produtoId,
        descricao: prod ? `${prod.nome} (SKU ${prod.sku})` : r.descricaoBuscada.trim(),
        ocorrencias: 0,
        quantidade: 0,
        porMotivo: { SEM_ESTOQUE: 0, PRECO: 0, PRAZO_ENTREGA: 0, NAO_TRABALHAMOS: 0, OUTRO: 0 },
        ultima: r.criadoEm,
      };
      grupos.set(chave, g);
    }
    g.ocorrencias++;
    g.quantidade += r.quantidade;
    g.porMotivo[r.motivo] += r.quantidade;
    if (r.criadoEm > g.ultima) g.ultima = r.criadoEm;
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, ...sugerirAcao(g, g.produtoId ? produtos.get(g.produtoId) : undefined) }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias || b.quantidade - a.quantidade);
}
