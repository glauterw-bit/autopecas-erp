import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { comAuth, ApiError } from "@/lib/auth/guard";
import { parseXml } from "@/lib/catalogo/tecdoc-xml";
import { encontrar, filtrar, textoDe, type NoXml } from "@/lib/nfe/xml-nfe";

// Prévia da NF-e de compra (XML), SEM gravar nada.
// POST multipart (campo "xml"), ESTOQUISTA. Mostra fornecedor, totais e quais
// itens a loja reconhece (mesmo critério da importação: SKU, EAN ou código do
// fabricante), para a pessoa conferir antes de dar entrada.

const LIMITE = 5 * 1024 * 1024;

export const POST = comAuth("ESTOQUISTA", async (req, _ctx, usuario) => {
  const empresaId = usuario.empresaId;
  const form = await req.formData();
  const arq = form.get("xml");
  if (!(arq instanceof File)) throw new ApiError(400, "Escolha o arquivo XML da nota.");
  if (arq.size > LIMITE) throw new ApiError(413, "Arquivo grande demais (limite de 5 MB).");
  const xml = await arq.text();

  let tree: NoXml[];
  try {
    tree = parseXml(xml) as NoXml[];
  } catch {
    throw new ApiError(422, "Não consegui ler este arquivo. Ele precisa ser o XML da NF-e.");
  }
  const infNFe = encontrar(tree, "infNFe");
  if (!infNFe) throw new ApiError(422, "Este XML não é de uma NF-e (não achei os dados da nota).");

  const ide = encontrar([infNFe], "ide");
  const emit = encontrar([infNFe], "emit");
  const icmsTot = encontrar([infNFe], "ICMSTot");
  const chave = (infNFe.attrs.Id ?? "").replace(/^NFe/, "");
  const dets = filtrar([infNFe], "det");

  const bruto = dets.map((det) => {
    const prod = encontrar([det], "prod");
    const ean = textoDe(prod, "cEAN");
    return {
      codigo: textoDe(prod, "cProd") ?? "",
      ean: ean && ean !== "SEM GTIN" ? ean : null,
      descricao: textoDe(prod, "xProd") ?? "",
      quantidade: Number(textoDe(prod, "qCom") ?? 0),
      unidade: textoDe(prod, "uCom") ?? "UN",
      valorUnitario: Number(textoDe(prod, "vUnCom") ?? 0),
      valorTotal: Number(textoDe(prod, "vProd") ?? 0),
      ncm: textoDe(prod, "NCM") ?? null,
    };
  });

  const codigos = [...new Set(bruto.map((i) => i.codigo).filter(Boolean))];
  const eans = [...new Set(bruto.map((i) => i.ean).filter((e): e is string => !!e))];
  const candidatos = codigos.length || eans.length
    ? await prisma.produto.findMany({
        where: {
          empresaId,
          OR: [
            { sku: { in: codigos } },
            { codigoFabricante: { in: codigos } },
            ...(eans.length ? [{ codigoBarras: { in: eans } }] : []),
          ],
        },
        select: { id: true, sku: true, nome: true, codigoBarras: true, codigoFabricante: true },
      })
    : [];

  const itens = bruto.map((i) => {
    const p =
      candidatos.find((c) => c.sku === i.codigo) ??
      (i.ean ? candidatos.find((c) => c.codigoBarras === i.ean) : undefined) ??
      candidatos.find((c) => c.codigoFabricante === i.codigo);
    return { ...i, produto: p ? { id: p.id, sku: p.sku, nome: p.nome } : null };
  });

  const existente = chave
    ? await prisma.notaEntrada.findFirst({
        where: { chaveAcesso: chave, fornecedor: { empresaId } },
        select: { id: true },
      })
    : null;
  const jaRecebida = existente
    ? Boolean(
        await prisma.movimentoEstoque.findFirst({
          where: { origemTipo: "ENTRADA_NF", origemId: existente.id },
          select: { id: true },
        }),
      )
    : false;

  return NextResponse.json({
    chave,
    numero: textoDe(ide, "nNF") ?? "",
    serie: textoDe(ide, "serie") ?? "",
    emissao: textoDe(ide, "dhEmi") ?? null,
    fornecedor: textoDe(emit, "xNome") ?? "",
    valorProdutos: Number(textoDe(icmsTot, "vProd") ?? 0),
    valorTotal: Number(textoDe(icmsTot, "vNF") ?? 0),
    itens,
    reconhecidos: itens.filter((i) => i.produto).length,
    jaImportada: Boolean(existente),
    jaRecebida,
  });
});
