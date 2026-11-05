// Exportação dos dados da empresa (portabilidade e saída do cliente).
// Toda leitura filtra por empresaId, direto ou pelo produto/venda/depósito
// dono do registro. Campos secretos nunca saem (hash de senha do portal B2B).
import type { PrismaClient } from "@prisma/client";
import { celulaCsv } from "./csv";
import type { EntradaZip } from "./zip";

const LOTE = 2000;
const SEGREDOS = ["senhaHashB2B", "totpSecret", "senhaHash"] as const;

type Linha = Record<string, unknown> & { id: string };
type Leitor = (args: { take: number; skip: number; cursor?: { id: string } }) => Promise<unknown[]>;

/** Lê a tabela em lotes por cursor de id: nunca mais que LOTE linhas na memória. */
async function* lotes(ler: Leitor): AsyncGenerator<Linha[]> {
  let cursor: string | undefined;
  for (;;) {
    const lote = (await ler({ take: LOTE, skip: cursor ? 1 : 0, cursor: cursor ? { id: cursor } : undefined })) as Linha[];
    if (lote.length) yield lote;
    if (lote.length < LOTE) return;
    cursor = lote[lote.length - 1].id;
  }
}

export type ContagemExportacao = Record<string, number>;

/** CSV em pedaços (um por lote). As colunas saem do primeiro registro, como em linhasParaCsv. */
async function* csvEmLotes(
  nome: string,
  ler: Leitor,
  contagem: ContagemExportacao,
  ajustar: (l: Linha) => Linha = (l) => l,
): AsyncGenerator<string> {
  let n = 0;
  let colunas: string[] | null = null;
  for await (const lote of lotes(ler)) {
    const linhas = lote.map(ajustar);
    if (!colunas) {
      colunas = Object.keys(linhas[0]).filter((c) => !(SEGREDOS as readonly string[]).includes(c));
      yield "\uFEFF" + colunas.join(";") + "\r\n";
    }
    yield linhas.map((l) => colunas!.map((c) => celulaCsv(l[c])).join(";")).join("\r\n") + "\r\n";
    n += linhas.length;
  }
  if (!colunas) yield "\uFEFF\r\n";
  contagem[nome] = n;
}

/** Gera as entradas do ZIP. `contagem` é preenchida enquanto lê (vai no LEIAME). */
export async function* entradasExportacao(
  db: PrismaClient,
  empresaId: string,
  contagem: ContagemExportacao = {},
  agora = new Date(),
): AsyncGenerator<EntradaZip> {
  const base = { orderBy: { id: "asc" as const } };
  const csv = (nome: string, ler: Leitor, ajustar?: (l: Linha) => Linha): EntradaZip => ({
    nome: `${nome}.csv`,
    conteudo: csvEmLotes(nome, ler, contagem, ajustar),
  });

  yield csv("produtos", (a) => db.produto.findMany({ ...base, ...a, where: { empresaId } }));
  yield csv(
    "aplicacoes-veiculares",
    (a) =>
      db.aplicacaoVeicular.findMany({
        ...base,
        ...a,
        where: { produto: { empresaId } },
        include: { produto: { select: { sku: true } } },
      }),
    ({ produto, ...r }) => ({ ...r, sku: (produto as { sku: string }).sku }) as Linha,
  );
  yield csv(
    "estoque",
    (a) =>
      db.estoqueDeposito.findMany({
        ...base,
        ...a,
        where: { produto: { empresaId }, deposito: { empresaId } },
        include: { produto: { select: { sku: true } }, deposito: { select: { nome: true } } },
      }),
    ({ produto, deposito, ...r }) =>
      ({ ...r, sku: (produto as { sku: string }).sku, deposito: (deposito as { nome: string }).nome }) as Linha,
  );
  yield csv("clientes", (a) => db.cliente.findMany({ ...base, ...a, where: { empresaId } }));
  yield csv("fornecedores", (a) => db.fornecedor.findMany({ ...base, ...a, where: { empresaId } }));
  yield csv("vendas", (a) => db.venda.findMany({ ...base, ...a, where: { empresaId } }));
  yield csv("itens-de-venda", (a) => db.itemVenda.findMany({ ...base, ...a, where: { venda: { empresaId } } }));
  yield csv("contas-a-receber", (a) => db.contaReceber.findMany({ ...base, ...a, where: { empresaId } }));
  yield csv("contas-a-pagar", (a) => db.contaPagar.findMany({ ...base, ...a, where: { empresaId } }));
  yield csv("kardex", (a) =>
    db.movimentoEstoque.findMany({ ...base, ...a, where: { produto: { empresaId }, deposito: { empresaId } } }),
  );

  // XMLs gravados no sistema (autorizados e de cancelamento), um arquivo por nota.
  let xmls = 0;
  let cursor: string | undefined;
  for (;;) {
    const notas = await db.notaFiscal.findMany({
      where: { empresaId, OR: [{ xmlAutorizado: { not: null } }, { xmlCancelamento: { not: null } }] },
      select: { id: true, modelo: true, serie: true, numero: true, chaveAcesso: true, xmlAutorizado: true, xmlCancelamento: true },
      orderBy: { id: "asc" },
      take: 200,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
    });
    for (const n of notas) {
      const ident = n.chaveAcesso ?? `${n.modelo}-${n.serie}-${n.numero}`;
      if (n.xmlAutorizado) {
        xmls++;
        yield { nome: `xml/${ident}.xml`, conteudo: n.xmlAutorizado };
      }
      if (n.xmlCancelamento) {
        xmls++;
        yield { nome: `xml/${ident}-cancelamento.xml`, conteudo: n.xmlCancelamento };
      }
    }
    if (notas.length < 200) break;
    cursor = notas[notas.length - 1].id;
  }
  contagem["xml"] = xmls;

  const linhas = Object.entries(contagem).map(([k, v]) => `${k}: ${v}`);
  yield {
    nome: "LEIAME.txt",
    conteudo:
      `Exportação dos dados da empresa, gerada em ${agora.toISOString()}.\r\n` +
      `Os arquivos .csv usam ponto e vírgula e abrem direto no Excel.\r\n` +
      `A pasta xml/ traz os XMLs de notas que o sistema tem gravados. Nota que não aparece aqui ` +
      `precisa ser baixada no portal da SEFAZ ou no emissor de notas.\r\n` +
      `Senhas e segredos de acesso não são exportados.\r\n\r\nQuantidade de registros:\r\n${linhas.join("\r\n")}\r\n`,
  };
}
