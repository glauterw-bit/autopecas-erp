import type Anthropic from "@anthropic-ai/sdk";
import { AI_MODELS, anthropic, cachedSystem } from "./client";

// NF-IA — OCR inteligente de Nota Fiscal de entrada.
// Aceita PDF/imagem da DANFE e devolve dados estruturados prontos para
// virar `NotaEntrada` no banco, incluindo:
//   - cabeçalho fiscal
//   - itens com tentativa de match com SKU já cadastrado
//   - sugestão de preço de venda com base na margem-alvo do produto

const SYSTEM_PROMPT_OCR = `Você é um especialista em leitura de DANFE / NF-e brasileira.
Sua função é extrair dados fiscais com precisão >= 97% e devolver JSON estruturado.

REGRAS:
- Não invente valores. Se um campo não puder ser lido, retorne null.
- Datas no formato ISO YYYY-MM-DD.
- Valores monetários como número (ponto como separador decimal).
- NCM com 8 dígitos, CFOP com 4 dígitos, CST com 2 ou 3 dígitos.
- Itens: leia DESCRIÇÃO, CÓDIGO PRODUTO, NCM, CFOP, QUANTIDADE, VLR UNIT, VLR TOTAL, IPI.`;

export interface NfEntradaExtraida {
  emitenteCnpj: string | null;
  emitenteRazaoSocial: string | null;
  destinatarioCnpj: string | null;
  numero: string | null;
  serie: string | null;
  chaveAcesso: string | null;
  dataEmissao: string | null;
  valorProdutos: number | null;
  valorFrete: number;
  valorDesconto: number;
  valorIpi: number;
  valorIcmsSt: number;
  valorTotal: number | null;
  itens: Array<{
    codigoFornecedor: string | null;
    descricao: string;
    ncm: string | null;
    cfop: string | null;
    quantidade: number;
    unidade: string;
    valorUnitario: number;
    valorTotal: number;
    ipi: number;
  }>;
  confiancaGeral: number;
}

export async function extrairNfEntrada(
  arquivos: Array<{ base64: string; tipo: "image/jpeg" | "image/png" | "application/pdf" }>,
): Promise<NfEntradaExtraida> {
  const conteudoUser: Anthropic.Messages.ContentBlockParam[] = [];
  for (const arq of arquivos) {
    if (arq.tipo === "application/pdf") {
      conteudoUser.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: arq.base64 },
      });
    } else {
      conteudoUser.push({
        type: "image",
        source: { type: "base64", media_type: arq.tipo, data: arq.base64 },
      });
    }
  }
  conteudoUser.push({
    type: "text",
    text: `Extraia os dados da DANFE/NF-e e responda APENAS o JSON conforme schema.
Schema:
{
  "emitenteCnpj": "string|null",
  "emitenteRazaoSocial": "string|null",
  "destinatarioCnpj": "string|null",
  "numero": "string|null",
  "serie": "string|null",
  "chaveAcesso": "string|null",
  "dataEmissao": "YYYY-MM-DD|null",
  "valorProdutos": number|null,
  "valorFrete": number,
  "valorDesconto": number,
  "valorIpi": number,
  "valorIcmsSt": number,
  "valorTotal": number|null,
  "itens": [{
    "codigoFornecedor": "string|null",
    "descricao": "string",
    "ncm": "string|null",
    "cfop": "string|null",
    "quantidade": number,
    "unidade": "string",
    "valorUnitario": number,
    "valorTotal": number,
    "ipi": number
  }],
  "confiancaGeral": 0.0
}`,
  });

  const resp = await anthropic.messages.create({
    model: AI_MODELS.default,
    max_tokens: 4096,
    system: [cachedSystem(SYSTEM_PROMPT_OCR)],
    messages: [{ role: "user", content: conteudoUser }],
  });

  const texto = resp.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("OCR NF-e: resposta sem JSON válido");
  return JSON.parse(m[0]) as NfEntradaExtraida;
}
