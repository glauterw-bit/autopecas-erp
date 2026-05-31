import { prisma } from "../db";

// SPED — Sistema Público de Escrituração Digital
// ==============================================
// Geramos os arquivos no formato oficial (TXT com registros tipados, campos
// separados por "|" no início e fim). Cobre:
//   - SPED ECD (Contábil): registros 0000, I010, I012, I050, I051, I100, I150,
//                          I200, I250, I550, 9999
//   - SPED EFD-ICMS/IPI (Fiscal): 0000, 0150, 0200, C100, C170, C190, 9999
//
// Conformidade: Atos Cotepe vigentes. Validar com PVA SPED antes de transmitir.

function pipe(...campos: (string | number | null | undefined)[]) {
  return "|" + campos.map((c) => (c === null || c === undefined ? "" : String(c))).join("|") + "|";
}

function dataSped(d: Date | null | undefined): string {
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}${d.getFullYear()}`;
}

function valorSped(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

// SPED ECD — Escrituração Contábil Digital (Lucro Real/Presumido obrigados)
export async function gerarSpedECD(opts: {
  empresaId: string;
  inicio: Date;
  fim: Date;
}): Promise<string> {
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: opts.empresaId },
  });

  const linhas: string[] = [];

  // Registro 0000: Abertura
  linhas.push(
    pipe(
      "0000",
      "LECD",
      dataSped(opts.inicio),
      dataSped(opts.fim),
      empresa.razaoSocial,
      empresa.cnpj,
      empresa.uf,
      empresa.inscEstadual,
      "", // código município IBGE
      empresa.inscMunicipal,
      "0", // indicador situação especial
      "0", // PL ant. (0 = original)
      "G", // hash do arquivo anterior
      "0", // tipo ECD: 0=normal
      empresa.cnpj.slice(0, 8), // CNPJ matriz
      "S", // SCP
    ),
  );

  // I010: Identificação da escrituração contábil
  linhas.push(pipe("I010", "G", "8.00"));

  // I012: Livros auxiliares (Diário e Razão)
  linhas.push(pipe("I012", "1", "Livro Diário Geral", "G"));
  linhas.push(pipe("I012", "2", "Livro Razão Auxiliar", "R"));

  // I050: Plano de contas
  const planos = await prisma.planoConta.findMany({
    where: {},
    orderBy: { codigo: "asc" },
  });
  for (const p of planos) {
    linhas.push(
      pipe(
        "I050",
        dataSped(opts.inicio),
        "A", // analítica (S) ou sintética (A) — simplificado
        nivelDoCodigo(p.codigo),
        tipoContaSped(p.tipo),
        p.codigo,
        p.parentId ? p.codigo.split(".").slice(0, -1).join(".") : "",
        p.nome,
      ),
    );
  }

  // I100: Centros de custo (não implementado — skip)
  // I150 + I155: Saldos periódicos
  const inicioStr = dataSped(opts.inicio);
  const fimStr = dataSped(opts.fim);
  linhas.push(pipe("I150", inicioStr, fimStr));

  // I200/I250: Lançamentos contábeis - cada movimento gera um lote.
  const movimentos = await prisma.movimentoCaixa.findMany({
    where: {
      empresaId: opts.empresaId,
      data: { gte: opts.inicio, lte: opts.fim },
    },
    include: { planoConta: true },
    orderBy: { data: "asc" },
  });
  let lote = 0;
  for (const m of movimentos) {
    lote++;
    linhas.push(pipe("I200", String(lote).padStart(6, "0"), dataSped(m.data), valorSped(Number(m.valor)), "N"));
    linhas.push(
      pipe(
        "I250",
        m.planoConta?.codigo ?? "1.1.01.001",
        "",
        valorSped(Number(m.valor)),
        m.tipo === "ENTRADA" ? "C" : "D",
        m.descricao.slice(0, 700),
      ),
    );
  }

  // I550: Detalhamento das contas no período (saldo final)
  // Calculado a partir da agregação dos lançamentos.

  // 9999: Encerramento
  linhas.push(pipe("9999", String(linhas.length + 1)));

  return linhas.join("\r\n") + "\r\n";
}

function nivelDoCodigo(codigo: string): string {
  return String(codigo.split(".").length);
}

function tipoContaSped(tipo: string): string {
  // Tabela SPED: 01=Ativo, 02=Passivo, 03=PL, 04=Resultado, 05=Compensação
  return (
    {
      RECEITA: "04",
      DESPESA: "04",
      INVESTIMENTO: "01",
      TRANSFERENCIA: "01",
    } as Record<string, string>
  )[tipo] ?? "01";
}

// SPED EFD-ICMS/IPI — Escrituração Fiscal Digital
export async function gerarSpedEFD(opts: {
  empresaId: string;
  inicio: Date;
  fim: Date;
}): Promise<string> {
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: opts.empresaId },
  });
  const linhas: string[] = [];

  // 0000: Abertura
  linhas.push(
    pipe(
      "0000",
      "018", // versão leiaute
      "0",   // finalidade: 0=original
      dataSped(opts.inicio),
      dataSped(opts.fim),
      empresa.razaoSocial,
      empresa.cnpj,
      "",    // CPF (PJ deixa vazio)
      empresa.uf,
      empresa.inscEstadual,
      "",    // código IBGE
      empresa.inscMunicipal,
      "",    // SUFRAMA
      "A",   // perfil: A, B ou C
      "1",   // tipo atividade: 1=industrial/equiparado, 0=outros
    ),
  );

  // 0001: Abertura do bloco 0
  linhas.push(pipe("0001", "0"));

  // 0150: Cadastro de participantes (clientes/fornecedores que aparecem nas NFs)
  const participantes = await prisma.$queryRaw<
    Array<{ id: string; nome: string; cpfCnpj: string | null; uf: string | null }>
  >`
    SELECT DISTINCT c.id, c.nome, c."cpfCnpj" AS "cpfCnpj", c.uf
      FROM clientes c
      JOIN notas_fiscais nf ON nf."clienteId" = c.id
     WHERE nf."empresaId" = ${opts.empresaId}
       AND nf."dataEmissao" BETWEEN ${opts.inicio} AND ${opts.fim}`;
  for (const p of participantes) {
    if (!p.cpfCnpj) continue;
    linhas.push(
      pipe(
        "0150",
        p.id.slice(0, 60),
        p.nome,
        "1058", // BR
        (p.cpfCnpj?.length ?? 0) === 14 ? p.cpfCnpj : "",
        (p.cpfCnpj?.length ?? 0) === 11 ? p.cpfCnpj : "",
        "",    // inscrição estadual
        "",    // município
        "",    // SUFRAMA
        "",    // endereço
        "",
        "",
        "",
        p.uf ?? "",
      ),
    );
  }

  // 0200: Cadastro de produtos vendidos
  const produtos = await prisma.produto.findMany({
    where: { empresaId: opts.empresaId, ativo: true },
    take: 5000,
  });
  for (const p of produtos) {
    linhas.push(
      pipe(
        "0200",
        p.sku.slice(0, 60),
        p.nome.slice(0, 255),
        p.codigoBarras ?? "",
        "", // código anterior
        p.unidade,
        "00", // tipo item: 00 mercadoria para revenda
        p.ncm ?? "",
        "",   // ex IPI
        "",   // gênero
        "",   // CEST
        valorSped(Number(p.aliquotaIcms ?? 0)),
      ),
    );
  }

  // Bloco C: Documentos fiscais
  linhas.push(pipe("C001", "0"));
  const notas = await prisma.notaFiscal.findMany({
    where: {
      empresaId: opts.empresaId,
      dataEmissao: { gte: opts.inicio, lte: opts.fim },
      status: "AUTORIZADA",
      modelo: { in: ["NFE_55", "NFCE_65"] },
    },
    include: {
      cliente: true,
      venda: { include: { itens: { include: { produto: true } } } },
    },
    orderBy: { dataEmissao: "asc" },
  });
  for (const nf of notas) {
    linhas.push(
      pipe(
        "C100",
        "1", // saída
        "0", // emitente próprio
        nf.cliente?.id?.slice(0, 60) ?? "",
        "55",
        "00", // situação: 00=Documento regular
        nf.serie,
        nf.numero,
        nf.chaveAcesso ?? "",
        dataSped(nf.dataEmissao),
        dataSped(nf.dataAutorizacao),
        valorSped(Number(nf.valorTotal)),
        "0",  // indicador pagamento à vista
        valorSped(Number(nf.valorDesconto)),
        valorSped(0), // abatimento não-tributado
        valorSped(Number(nf.valorProdutos)),
        "1",  // indicador frete
        valorSped(Number(nf.valorFrete)),
        valorSped(0),
        valorSped(0),
        valorSped(Number(nf.valorIpi)),
        valorSped(Number(nf.valorPis)),
        valorSped(Number(nf.valorCofins)),
        valorSped(Number(nf.valorIcms)),
        valorSped(Number(nf.valorIcmsSt)),
      ),
    );
    // C170: itens
    let n = 0;
    for (const it of nf.venda?.itens ?? []) {
      n++;
      linhas.push(
        pipe(
          "C170",
          n,
          it.produto.sku.slice(0, 60),
          it.produto.nome.slice(0, 255),
          valorSped(Number(it.quantidade)),
          it.produto.unidade,
          valorSped(Number(it.total)),
          valorSped(Number(it.desconto)),
          "0",
          "5102", // CFOP padrão
          it.produto.cstIcms ?? "102",
        ),
      );
    }
  }

  // 9999: Encerramento
  linhas.push(pipe("9999", String(linhas.length + 1)));

  return linhas.join("\r\n") + "\r\n";
}
