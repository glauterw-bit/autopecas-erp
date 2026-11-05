import OpenAI from "openai";
import { z } from "zod";
import { chamarEstruturado } from "./chamada";
import { openai } from "./client";
import { formatarCentavos, paraCentavos, totalItemCentavos } from "./dinheiro";

// NF-IA: OCR inteligente de DANFE
// ===============================
// Aceita imagens (JPG/PNG) ou PDFs (via Files API da OpenAI).
// Devolve dados estruturados para a tela de entrada, onde o humano confere antes
// de virar `NotaEntrada`. Os valores são LIDOS do documento (não são preço do ERP);
// a conferência em centavos aponta somas que não fecham para a pessoa revisar.
// Quando houver o XML da nota, use src/lib/nfe/importar-xml.ts, que é exato.

const SYSTEM_PROMPT_OCR = `Você é um especialista em leitura de DANFE / NF-e brasileira.
Sua função é extrair os dados fiscais do documento com precisão.

REGRAS:
- Não invente valores. Se um campo não puder ser lido, retorne null.
- Datas no formato ISO YYYY-MM-DD.
- Valores monetários como número em reais (ponto como separador decimal), exatamente como impressos.
- NCM com 8 dígitos, CFOP com 4 dígitos.
- Itens: leia DESCRIÇÃO, CÓDIGO PRODUTO, NCM, CFOP, QUANTIDADE, VLR UNIT, VLR TOTAL, IPI.
- "confiancaGeral" vai de 0 a 1.`;

const itemSchema = z.object({
  codigoFornecedor: z.string().nullable(),
  descricao: z.string(),
  ncm: z.string().nullable(),
  cfop: z.string().nullable(),
  quantidade: z.number(),
  unidade: z.string(),
  valorUnitario: z.number(),
  valorTotal: z.number(),
  ipi: z.number(),
});

export const nfEntradaSchema = z.object({
  emitenteCnpj: z.string().nullable(),
  emitenteRazaoSocial: z.string().nullable(),
  destinatarioCnpj: z.string().nullable(),
  numero: z.string().nullable(),
  serie: z.string().nullable(),
  chaveAcesso: z.string().nullable(),
  dataEmissao: z.string().nullable(),
  valorProdutos: z.number().nullable(),
  valorFrete: z.number(),
  valorDesconto: z.number(),
  valorIpi: z.number(),
  valorIcmsSt: z.number(),
  valorTotal: z.number().nullable(),
  itens: z.array(itemSchema),
  confiancaGeral: z.number(),
});

export type NfEntradaLida = z.infer<typeof nfEntradaSchema>;

export interface ConferenciaNf {
  /** Soma dos itens, em centavos. */
  somaItensCentavos: number;
  /** Total calculado (produtos + frete + IPI + ST − desconto), em centavos. */
  totalCalculadoCentavos: number | null;
  alertas: string[];
}

export type NfEntradaExtraida = NfEntradaLida & { conferencia: ConferenciaNf };

const so = (s: string | null) => (s ? s.replace(/\D/g, "") : null);

/** Normaliza e confere as somas em centavos. Não corrige valor: só aponta para o humano. */
export function conferirNfLida(nf: NfEntradaLida): NfEntradaExtraida {
  const alertas: string[] = [];
  const chave = so(nf.chaveAcesso);
  const out: NfEntradaLida = {
    ...nf,
    emitenteCnpj: so(nf.emitenteCnpj),
    destinatarioCnpj: so(nf.destinatarioCnpj),
    chaveAcesso: chave,
    confiancaGeral: Math.min(Math.max(nf.confiancaGeral, 0), 1),
    itens: nf.itens.map((i) => ({ ...i, ncm: so(i.ncm), cfop: so(i.cfop) })),
  };

  if (chave && chave.length !== 44) alertas.push("A chave de acesso lida não tem 44 dígitos.");
  out.itens.forEach((i, n) => {
    if (i.ncm && i.ncm.length !== 8) alertas.push(`Item ${n + 1}: NCM lido não tem 8 dígitos.`);
    if (i.cfop && i.cfop.length !== 4) alertas.push(`Item ${n + 1}: CFOP lido não tem 4 dígitos.`);
    const esperado = totalItemCentavos(i.valorUnitario, i.quantidade);
    // Tolerância de 1 centavo por arredondamento do valor unitário impresso.
    if (Math.abs(esperado - paraCentavos(i.valorTotal)) > 1) {
      alertas.push(
        `Item ${n + 1}: quantidade × valor unitário (${formatarCentavos(esperado)}) não bate com o total lido (${formatarCentavos(paraCentavos(i.valorTotal))}).`,
      );
    }
  });

  const somaItensCentavos = out.itens.reduce((a, i) => a + paraCentavos(i.valorTotal), 0);
  if (out.valorProdutos !== null && paraCentavos(out.valorProdutos) !== somaItensCentavos) {
    alertas.push(
      `A soma dos itens (${formatarCentavos(somaItensCentavos)}) não bate com o total de produtos lido (${formatarCentavos(paraCentavos(out.valorProdutos))}). Algum item pode ter ficado de fora.`,
    );
  }
  let totalCalculadoCentavos: number | null = null;
  if (out.valorProdutos !== null) {
    totalCalculadoCentavos =
      paraCentavos(out.valorProdutos) +
      paraCentavos(out.valorFrete) +
      paraCentavos(out.valorIpi) +
      paraCentavos(out.valorIcmsSt) -
      paraCentavos(out.valorDesconto);
    if (out.valorTotal !== null && totalCalculadoCentavos !== paraCentavos(out.valorTotal)) {
      alertas.push(
        `O total da nota lido (${formatarCentavos(paraCentavos(out.valorTotal))}) difere do calculado (${formatarCentavos(totalCalculadoCentavos)}). Confira seguro e outras despesas.`,
      );
    }
  }
  return { ...out, conferencia: { somaItensCentavos, totalCalculadoCentavos, alertas } };
}

export async function extrairNfEntrada(
  empresaId: string,
  arquivos: Array<{ base64: string; tipo: "image/jpeg" | "image/png" | "application/pdf" }>,
): Promise<NfEntradaExtraida> {
  // Para PDF: subir via Files API e referenciar pelo file_id; OpenAI processa pdf nativo.
  // Para imagens: passar inline via data URL.
  const conteudo: OpenAI.Chat.ChatCompletionContentPart[] = [];
  const enviados: string[] = [];

  try {
    for (const arq of arquivos) {
      if (arq.tipo === "application/pdf") {
        const buffer = Buffer.from(arq.base64, "base64");
        const file = await openai.files.create({
          file: await OpenAI.toFile(buffer, "nfe.pdf", { type: "application/pdf" }),
          purpose: "user_data",
        });
        enviados.push(file.id);
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
    conteudo.push({ type: "text", text: "Extraia os dados desta DANFE/NF-e." });

    const lida = await chamarEstruturado({
      empresaId,
      recurso: "ocr-nf",
      papel: "default",
      maxTokens: 8192,
      schema: nfEntradaSchema,
      nomeSchema: "nf_entrada",
      mensagens: [
        { role: "system", content: SYSTEM_PROMPT_OCR },
        { role: "user", content: conteudo },
      ],
    });
    return conferirNfLida(lida);
  } finally {
    // A nota tem CNPJ e valores do fornecedor: não deixa o PDF guardado na OpenAI.
    for (const id of enviados) {
      await openai.files.del(id).catch(() => undefined);
    }
  }
}
