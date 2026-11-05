// Leitura dos itens de um XML de NF-e/NFC-e (procNFe ou NFe)
// =========================================================
// Usado na importação de entrada (ST retida por item, base da CAT 28/2020) e
// na devolução de notas antigas (nItem e tributação do item original).
// Tags conforme o leiaute da NF-e (MOC 7.0 / NT 2025.002).

import { parseXml } from "../catalogo/tecdoc-xml";

export type NoXml = { tag: string; attrs: Record<string, string>; children: NoXml[]; text?: string };

export function encontrar(nodes: NoXml[], tag: string): NoXml | undefined {
  for (const n of nodes) {
    if (n.tag === tag) return n;
    const r = encontrar(n.children, tag);
    if (r) return r;
  }
  return undefined;
}

export function filtrar(nodes: NoXml[], tag: string): NoXml[] {
  const out: NoXml[] = [];
  for (const n of nodes) {
    if (n.tag === tag) out.push(n);
    out.push(...filtrar(n.children, tag));
  }
  return out;
}

export function textoDe(node: NoXml | undefined, tag: string): string | undefined {
  if (!node) return undefined;
  return encontrar([node], tag)?.text;
}

const num = (s?: string) => (s == null || s === "" ? null : Number(s));

export interface ItemXmlNfe {
  nItem: number;
  cProd: string;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  quantidade: number;
  /** CST (regime normal) ou CSOSN (Simples) do ICMS. */
  cstIcms: string | null;
  pIcms: number | null;
  cstPis: string | null;
  cstCofins: string | null;
  vBcSt: number | null;
  vIcmsSt: number | null;
  vBcStRet: number | null;
  vIcmsStRet: number | null;
  vIcmsSubstituto: number | null;
}

export function itensDoXmlNfe(xml: string): ItemXmlNfe[] {
  const tree = parseXml(xml) as NoXml[];
  return filtrar(tree, "det").map((det, idx) => {
    const prod = encontrar([det], "prod");
    const icms = encontrar([det], "ICMS");
    const pis = encontrar([det], "PIS");
    const cofins = encontrar([det], "COFINS");
    return {
      nItem: Number(det.attrs.nItem ?? idx + 1),
      cProd: textoDe(prod, "cProd") ?? "",
      ncm: textoDe(prod, "NCM") ?? null,
      cest: textoDe(prod, "CEST") ?? null,
      cfop: textoDe(prod, "CFOP") ?? null,
      quantidade: Number(textoDe(prod, "qCom") ?? 0),
      cstIcms: textoDe(icms, "CSOSN") ?? textoDe(icms, "CST") ?? null,
      pIcms: num(textoDe(icms, "pICMS")),
      cstPis: textoDe(pis, "CST") ?? null,
      cstCofins: textoDe(cofins, "CST") ?? null,
      vBcSt: num(textoDe(icms, "vBCST")),
      vIcmsSt: num(textoDe(icms, "vICMSST")),
      vBcStRet: num(textoDe(icms, "vBCSTRet")),
      vIcmsStRet: num(textoDe(icms, "vICMSSTRet")),
      vIcmsSubstituto: num(textoDe(icms, "vICMSSubstituto")),
    };
  });
}
