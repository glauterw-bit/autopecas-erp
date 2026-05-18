import OpenAI from "openai";
import { AI_MODELS, extrairJson, openai } from "./client";

// NF-IA — OCR inteligente de DANFE
// =================================
// Aceita imagens (JPG/PNG) ou PDFs (via Files API da OpenAI).
// Devolve dados estruturados prontos para virar `NotaEntrada` no banco.

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

const SCHEMA_PROMPT = `Extraia os dados da DANFE/NF-e e responda APENAS o JSON conforme schema:
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
}`;

export async function extrairNfEntrada(
  arquivos: Array<{ base64: string; tipo: "image/jpeg" | "image/png" | "application/pdf" }>,
): Promise<NfEntradaExtraida> {
  // Para PDF: subir via Files API e referenciar pelo file_id; OpenAI processa pdf nativo.
  // Para imagens: passar inline via data URL.
  const conteudo: OpenAI.Chat.ChatCompletionContentPart[] = [];

  for (const arq of arquivos) {
    if (arq.tipo === "application/pdf") {
      // Faz upload do PDF para usar como "input_file"
      const buffer = Buffer.from(arq.base64, "base64");
      const file = await openai.files.create({
        file: await OpenAI.toFile(buffer, "nfe.pdf", { type: "application/pdf" }),
        purpose: "user_data",
      });
      conteudo.push({
        type: "file",
        file: { file_id: file.id },
      } as OpenAI.Chat.ChatCompletionContentPart);
    } else {
      conteudo.push({
        type: "image_url",
        image_url: { url: `data:${arq.tipo};base64,${arq.base64}` },
      });
    }
  }
  conteudo.push({ type: "text", text: SCHEMA_PROMPT });

  const resp = await openai.chat.completions.create({
    model: AI_MODELS.default,
    max_completion_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT_OCR },
      { role: "user", content: conteudo },
    ],
  });
  const texto = resp.choices[0]?.message?.content ?? "";
  return extrairJson<NfEntradaExtraida>(texto);
}
