import { prisma } from "../db";
import { parseXml } from "../catalogo/tecdoc-xml";

// Importação de NF-e de entrada via XML
// =====================================
// Cliente envia o XML (geralmente recebido por email do fornecedor) ou cola
// a chave de acesso (44 dígitos) e o sistema faz pull via Focus NFe ao manifesto
// do destinatário.
//
// Cria `NotaEntrada` + `ItemNotaEntrada`. Tenta match por SKU/EAN com produtos
// existentes; o que não matchar fica em `produtoId=null` para revisão manual.

interface ResultadoImport {
  chave: string;
  numero: string;
  serie: string;
  fornecedorCnpj: string;
  notaEntradaId: string;
  itensMatched: number;
  itensSemMatch: number;
}

export async function importarXmlNfeEntrada(opts: {
  empresaId: string;
  xml: string;
}): Promise<ResultadoImport> {
  const tree = parseXml(opts.xml);
  // O XML da NF-e brasileira tem raiz <nfeProc> ou <NFe>. Procuramos infNFe.
  const infNFe = encontrar(tree, "infNFe");
  if (!infNFe) throw new Error("XML não contém <infNFe>");

  const ide = encontrar([infNFe], "ide");
  const emit = encontrar([infNFe], "emit");
  const total = encontrar([infNFe], "total");
  const icmsTotal = total ? encontrar([total], "ICMSTot") : undefined;
  const dets = filtrar([infNFe], "det");

  const chave = (infNFe.attrs.Id ?? "").replace(/^NFe/, "");
  const numero = textoDe(ide, "nNF") ?? "";
  const serie = textoDe(ide, "serie") ?? "1";
  const dataEmissao = parseDataNfe(textoDe(ide, "dhEmi") ?? "");
  const fornecedorCnpj = textoDe(emit, "CNPJ") ?? textoDe(emit, "CPF") ?? "";
  const fornecedorRazao = textoDe(emit, "xNome") ?? "";

  const valorProdutos = Number(textoDe(icmsTotal, "vProd") ?? 0);
  const valorFrete = Number(textoDe(icmsTotal, "vFrete") ?? 0);
  const valorDesconto = Number(textoDe(icmsTotal, "vDesc") ?? 0);
  const valorIpi = Number(textoDe(icmsTotal, "vIPI") ?? 0);
  const valorIcmsSt = Number(textoDe(icmsTotal, "vST") ?? 0);
  const valorTotal = Number(textoDe(icmsTotal, "vNF") ?? 0);

  // Upsert do fornecedor
  const fornecedor = await prisma.fornecedor.upsert({
    where: { empresaId_cnpjCpf: { empresaId: opts.empresaId, cnpjCpf: fornecedorCnpj } },
    update: { razaoSocial: fornecedorRazao },
    create: {
      empresaId: opts.empresaId,
      cnpjCpf: fornecedorCnpj,
      razaoSocial: fornecedorRazao,
    },
  });

  // Idempotência: se já importamos esta chave, retornar a existente
  const existente = await prisma.notaEntrada.findUnique({
    where: { chaveAcesso: chave },
    include: { itens: true },
  });
  if (existente) {
    return {
      chave,
      numero,
      serie,
      fornecedorCnpj,
      notaEntradaId: existente.id,
      itensMatched: existente.itens.filter((i) => i.produtoId).length,
      itensSemMatch: existente.itens.filter((i) => !i.produtoId).length,
    };
  }

  let itensMatched = 0;
  let itensSemMatch = 0;

  const itensCriados = await Promise.all(
    dets.map(async (det) => {
      const prod = encontrar([det], "prod");
      const codProd = textoDe(prod, "cProd") ?? "";
      const ean = textoDe(prod, "cEAN");
      const xProd = textoDe(prod, "xProd") ?? "";
      const ncm = textoDe(prod, "NCM");
      const cfop = textoDe(prod, "CFOP");
      const unidade = textoDe(prod, "uCom") ?? "UN";
      const quantidade = Number(textoDe(prod, "qCom") ?? 0);
      const vUnit = Number(textoDe(prod, "vUnCom") ?? 0);
      const vTotal = Number(textoDe(prod, "vProd") ?? quantidade * vUnit);

      // Tenta encontrar produto existente por SKU exato ou EAN
      const produto = await prisma.produto.findFirst({
        where: {
          empresaId: opts.empresaId,
          OR: [
            { sku: codProd },
            ean && ean !== "SEM GTIN" ? { codigoBarras: ean } : { sku: "__nunca__" },
            { codigoFabricante: codProd },
          ],
        },
        select: { id: true, margemAlvo: true },
      });
      if (produto) itensMatched++;
      else itensSemMatch++;

      const margemAlvo = produto?.margemAlvo ? Number(produto.margemAlvo) : 0.35;
      const precoSugerido = vUnit / (1 - margemAlvo);

      return {
        produtoId: produto?.id,
        codigoFornecedor: codProd,
        descricaoOriginal: xProd,
        quantidade,
        unidade,
        valorUnitario: vUnit,
        valorTotal: vTotal,
        cfop,
        ncm,
        precoVendaSugerido: precoSugerido,
        margemSugerida: margemAlvo,
      };
    }),
  );

  const nota = await prisma.notaEntrada.create({
    data: {
      fornecedorId: fornecedor.id,
      chaveAcesso: chave,
      numero,
      serie,
      dataEmissao,
      valorProdutos,
      valorFrete,
      valorDesconto,
      valorIpi,
      valorIcmsSt,
      valorTotal,
      xmlOriginal: opts.xml,
      itens: { create: itensCriados },
    },
  });

  return {
    chave,
    numero,
    serie,
    fornecedorCnpj,
    notaEntradaId: nota.id,
    itensMatched,
    itensSemMatch,
  };
}

// Helpers do parser ---------------------------------------------------
type Node = { tag: string; attrs: Record<string, string>; children: Node[]; text?: string };

function encontrar(nodes: Node[], tag: string): Node | undefined {
  for (const n of nodes) {
    if (n.tag === tag) return n;
    const r = encontrar(n.children, tag);
    if (r) return r;
  }
  return undefined;
}
function filtrar(nodes: Node[], tag: string): Node[] {
  const out: Node[] = [];
  for (const n of nodes) {
    if (n.tag === tag) out.push(n);
    out.push(...filtrar(n.children, tag));
  }
  return out;
}
function textoDe(node: Node | undefined, tag: string): string | undefined {
  if (!node) return undefined;
  const found = encontrar([node], tag);
  return found?.text;
}
function parseDataNfe(s: string): Date {
  if (!s) return new Date();
  // 2026-05-18T10:00:00-03:00
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
