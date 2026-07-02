import { prisma } from "../db";
import { gerarBalanco } from "./balanco";
import { gerarDRE } from "./dre";

// SPED — Sistema Público de Escrituração Digital
// ==============================================
// Geramos os arquivos no formato oficial (TXT com registros tipados, campos
// separados por "|" no início e fim). Cobre:
//   - SPED ECD (Contábil): blocos 0, I (I010..I250), J (J005/J100/J150/J900) e 9
//   - SPED EFD-ICMS/IPI (Fiscal): blocos 0, C, D, E, G, H, 1 e 9
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

// Fecha um bloco com seu registro X990 (contagem inclui a própria linha X990).
function fecharBloco(bloco: string[], regEncerramento: string): void {
  bloco.push(pipe(regEncerramento, String(bloco.length + 1)));
}

// Monta o bloco 9 (controle e encerramento): 9001, um 9900 por tipo de
// registro presente no arquivo (com contagem), 9990 e 9999.
function montarBloco9(blocos: string[][]): string[] {
  const contagem = new Map<string, number>();
  for (const bloco of blocos) {
    for (const linha of bloco) {
      const reg = linha.split("|")[1];
      contagem.set(reg, (contagem.get(reg) ?? 0) + 1);
    }
  }
  contagem.set("9001", 1);
  contagem.set("9990", 1);
  contagem.set("9999", 1);
  // O próprio 9900 gera uma linha por tipo de registro (inclusive ele mesmo).
  contagem.set("9900", contagem.size + 1);

  const bloco9: string[] = [pipe("9001", "0")];
  for (const [reg, qtd] of contagem) {
    bloco9.push(pipe("9900", reg, String(qtd)));
  }
  // 9990: linhas do bloco 9 (incluindo 9990 e 9999)
  bloco9.push(pipe("9990", String(bloco9.length + 2)));
  // 9999: total de linhas do arquivo
  const totalArquivo = blocos.reduce((a, b) => a + b.length, 0) + bloco9.length + 1;
  bloco9.push(pipe("9999", String(totalArquivo)));
  return bloco9;
}

// Placeholder para campos que dependem da contagem total de linhas do arquivo
// (QTD_LIN dos termos de abertura/encerramento da ECD) — resolvido no final.
const QTD_LIN_TOKEN = "###QTD_LIN###";

// SPED ECD — Escrituração Contábil Digital (Lucro Real/Presumido obrigados)
export async function gerarSpedECD(opts: {
  empresaId: string;
  inicio: Date;
  fim: Date;
}): Promise<string> {
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: opts.empresaId },
  });

  // ---------------------------------------------------------------- Bloco 0
  const bloco0: string[] = [];
  bloco0.push(
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
  bloco0.push(pipe("0001", "0"));
  fecharBloco(bloco0, "0990");

  // ---------------------------------------------------------------- Bloco I
  const blocoI: string[] = [];
  blocoI.push(pipe("I001", "0"));

  // I010: Identificação da escrituração contábil
  blocoI.push(pipe("I010", "G", "8.00"));

  // I012: Livros auxiliares (Diário e Razão)
  blocoI.push(pipe("I012", "1", "Livro Diário Geral", "G"));
  blocoI.push(pipe("I012", "2", "Livro Razão Auxiliar", "R"));

  // I030: Termo de abertura do livro
  blocoI.push(
    pipe(
      "I030",
      "TERMO DE ABERTURA",
      "1", // número de ordem do livro
      "G", // natureza do livro (Diário Geral)
      "LIVRO DIARIO",
      QTD_LIN_TOKEN, // quantidade total de linhas (resolvido no final)
      empresa.razaoSocial,
      "", // NIRE
      empresa.cnpj,
      dataSped(opts.fim), // data do arquivamento dos atos constitutivos
      "", // data de arquivamento da conversão
      empresa.municipio ?? "",
      dataSped(opts.fim), // data de encerramento do exercício social
    ),
  );

  // I050: Plano de contas
  const planos = await prisma.planoConta.findMany({
    where: {},
    orderBy: { codigo: "asc" },
  });
  for (const p of planos) {
    blocoI.push(
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

  // Lançamentos do período (base para I155 e I200/I250)
  const movimentos = await prisma.movimentoCaixa.findMany({
    where: {
      empresaId: opts.empresaId,
      data: { gte: opts.inicio, lte: opts.fim },
    },
    include: { planoConta: true },
    orderBy: { data: "asc" },
  });

  // I150 + I155: Saldos periódicos por conta (derivados dos movimentos)
  blocoI.push(pipe("I150", dataSped(opts.inicio), dataSped(opts.fim)));
  const saldosPorConta = new Map<string, { debito: number; credito: number }>();
  for (const m of movimentos) {
    const codigo = m.planoConta?.codigo ?? "1.1.01.001";
    const s = saldosPorConta.get(codigo) ?? { debito: 0, credito: 0 };
    if (m.tipo === "ENTRADA") s.credito += Number(m.valor);
    else s.debito += Number(m.valor);
    saldosPorConta.set(codigo, s);
  }
  for (const [codigo, s] of [...saldosPorConta.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const saldoFinal = s.credito - s.debito;
    blocoI.push(
      pipe(
        "I155",
        codigo,
        "", // centro de custo
        valorSped(0), // saldo inicial (escrituração inicia zerada no período)
        "D",
        valorSped(s.debito),
        valorSped(s.credito),
        valorSped(Math.abs(saldoFinal)),
        saldoFinal >= 0 ? "C" : "D",
      ),
    );
  }

  // I200/I250: Lançamentos contábeis - cada movimento gera um lote.
  let lote = 0;
  for (const m of movimentos) {
    lote++;
    blocoI.push(pipe("I200", String(lote).padStart(6, "0"), dataSped(m.data), valorSped(Number(m.valor)), "N"));
    blocoI.push(
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
  fecharBloco(blocoI, "I990");

  // ---------------------------------------------------------------- Bloco J
  // Demonstrações contábeis: Balanço Patrimonial (J100) e DRE (J150)
  const blocoJ: string[] = [];
  blocoJ.push(pipe("J001", "0"));

  const [balanco, dre] = await Promise.all([
    gerarBalanco({ empresaId: opts.empresaId, dataReferencia: opts.fim }),
    gerarDRE({ empresaId: opts.empresaId, inicio: opts.inicio, fim: opts.fim }),
  ]);

  // J005 (demonstração 1): Balanço Patrimonial
  blocoJ.push(pipe("J005", dataSped(opts.inicio), dataSped(opts.fim), "1", "BALANCO PATRIMONIAL"));
  const pushJ100 = (
    codAgl: string,
    indCodAgl: "T" | "D",
    nivel: string,
    codAglSup: string,
    grupo: "A" | "P",
    descricao: string,
    valorFinal: number,
  ) => {
    blocoJ.push(
      pipe(
        "J100",
        codAgl,
        indCodAgl,
        nivel,
        codAglSup,
        grupo,
        descricao,
        valorSped(0), // saldo inicial
        grupo === "A" ? "D" : "C",
        valorSped(Math.abs(valorFinal)),
        valorFinal >= 0 ? (grupo === "A" ? "D" : "C") : grupo === "A" ? "C" : "D",
        "", // nota explicativa
      ),
    );
  };
  let seqAtivo = 0;
  for (const l of [...balanco.ativo.circulante, ...balanco.ativo.naoCirculante]) {
    seqAtivo++;
    pushJ100(`1.${String(seqAtivo).padStart(2, "0")}`, "D", "2", "1", "A", l.rotulo, l.valor);
  }
  pushJ100("1", "T", "1", "", "A", "ATIVO TOTAL", balanco.ativo.total);
  let seqPassivo = 0;
  for (const l of [
    ...balanco.passivo.circulante,
    ...balanco.passivo.naoCirculante,
    ...balanco.passivo.patrimonioLiquido,
  ]) {
    seqPassivo++;
    pushJ100(`2.${String(seqPassivo).padStart(2, "0")}`, "D", "2", "2", "P", l.rotulo, l.valor);
  }
  pushJ100("2", "T", "1", "", "P", "PASSIVO TOTAL + PATRIMONIO LIQUIDO", balanco.passivo.total);

  // J005 (demonstração 2): DRE
  blocoJ.push(pipe("J005", dataSped(opts.inicio), dataSped(opts.fim), "2", "DEMONSTRACAO DO RESULTADO DO EXERCICIO"));
  let seqDre = 0;
  for (const item of dre.itens) {
    seqDre++;
    blocoJ.push(
      pipe(
        "J150",
        String(seqDre), // número de ordem
        `3.${String(seqDre).padStart(2, "0")}`,
        "D",
        "1",
        "", // aglutinação superior
        item.rotulo,
        valorSped(Math.abs(item.valor)),
        item.valor >= 0 ? "C" : "D",
      ),
    );
  }

  // J900: Termo de encerramento do livro
  blocoJ.push(
    pipe(
      "J900",
      "TERMO DE ENCERRAMENTO",
      "1", // número de ordem do livro
      "LIVRO DIARIO",
      empresa.razaoSocial,
      QTD_LIN_TOKEN, // quantidade total de linhas (resolvido no final)
      dataSped(opts.inicio),
      dataSped(opts.fim),
    ),
  );
  fecharBloco(blocoJ, "J990");

  // ---------------------------------------------------------------- Bloco 9
  const bloco9 = montarBloco9([bloco0, blocoI, blocoJ]);

  const linhas = [...bloco0, ...blocoI, ...blocoJ, ...bloco9];
  const conteudo = linhas.join("\r\n").split(QTD_LIN_TOKEN).join(String(linhas.length));
  return conteudo + "\r\n";
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

// CST de ICMS com origem (3 dígitos) a partir do cadastro do produto.
function cstIcmsCompleto(cst: string | null | undefined, origem: number): string {
  const base = cst ?? "00";
  return base.length >= 3 ? base : `${origem}${base.padStart(2, "0")}`;
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
  const config = (empresa.configuracoes as Record<string, any> | null) ?? {};
  const contabilista = (config.contabilista ?? {}) as Record<string, string>;
  const cep = (empresa.cep ?? "").replace(/\D/g, "");

  // ---------------------------------------------------------------- Bloco 0
  const bloco0: string[] = [];
  bloco0.push(
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
  bloco0.push(pipe("0001", "0"));

  // 0005: Dados complementares da entidade
  bloco0.push(
    pipe(
      "0005",
      empresa.nomeFantasia ?? empresa.razaoSocial,
      cep,
      empresa.logradouro ?? "",
      empresa.numero ?? "",
      empresa.complemento ?? "",
      empresa.bairro ?? "",
      empresa.telefone ?? "",
      "", // fax
      empresa.email ?? "",
    ),
  );

  // 0100: Contabilista (dados de empresa.configuracoes.contabilista ou placeholder)
  bloco0.push(
    pipe(
      "0100",
      contabilista.nome ?? "CONTABILISTA NAO INFORMADO",
      contabilista.cpf ?? "00000000000",
      contabilista.crc ?? "",
      contabilista.cnpj ?? "",
      contabilista.cep ?? cep,
      contabilista.endereco ?? empresa.logradouro ?? "",
      contabilista.numero ?? empresa.numero ?? "",
      contabilista.complemento ?? "",
      contabilista.bairro ?? empresa.bairro ?? "",
      contabilista.telefone ?? empresa.telefone ?? "",
      "", // fax
      contabilista.email ?? empresa.email ?? "",
      contabilista.codMunicipio ?? "",
    ),
  );

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
    bloco0.push(
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

  // 0190/0200: Unidades e cadastro de produtos
  const produtos = await prisma.produto.findMany({
    where: { empresaId: opts.empresaId, ativo: true },
    take: 5000,
  });
  const unidades = [...new Set(produtos.map((p) => p.unidade))].sort();
  for (const u of unidades) {
    bloco0.push(pipe("0190", u, u));
  }
  for (const p of produtos) {
    bloco0.push(
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
        "",   // código serviço LST
        valorSped(Number(p.aliquotaIcms ?? 0)),
        p.cest ?? "",
      ),
    );
  }
  fecharBloco(bloco0, "0990");

  // ---------------------------------------------------------------- Bloco C
  const blocoC: string[] = [];
  blocoC.push(pipe("C001", "0"));
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

  let totalDebitosIcms = 0; // débitos de ICMS das saídas → E110

  for (const nf of notas) {
    const vlBcIcmsNota = Number(nf.valorIcms) > 0 ? Number(nf.valorProdutos) : 0;
    blocoC.push(
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
        valorSped(0), // seguro
        valorSped(0), // outras despesas
        valorSped(vlBcIcmsNota),
        valorSped(Number(nf.valorIcms)),
        valorSped(0), // BC ICMS-ST
        valorSped(Number(nf.valorIcmsSt)),
        valorSped(Number(nf.valorIpi)),
        valorSped(Number(nf.valorPis)),
        valorSped(Number(nf.valorCofins)),
      ),
    );

    // C170: itens + agregação para C190
    // C190 agrega por combinação CST-ICMS / CFOP / alíquota
    const agregadoC190 = new Map<
      string,
      { cst: string; cfop: string; aliq: number; vlOpr: number; vlBc: number; vlIcms: number }
    >();
    let n = 0;
    for (const it of nf.venda?.itens ?? []) {
      n++;
      const cst = cstIcmsCompleto(it.produto.cstIcms, it.produto.origemFiscal);
      const cfop = it.produto.cfopVendaInterna ?? "5102";
      const aliq = Number(it.produto.aliquotaIcms ?? 0);
      const vlItem = Number(it.total);
      const vlDesc = Number(it.desconto);
      const vlOperacao = vlItem - vlDesc;
      const vlBcIcms = aliq > 0 ? vlOperacao : 0;
      const vlIcms = (vlBcIcms * aliq) / 100;
      totalDebitosIcms += vlIcms;

      blocoC.push(
        pipe(
          "C170",
          n,
          it.produto.sku.slice(0, 60),
          it.produto.nome.slice(0, 255),
          valorSped(Number(it.quantidade)),
          it.produto.unidade,
          valorSped(vlItem),
          valorSped(vlDesc),
          "0", // IND_MOV: 0=com movimentação física
          cst,
          cfop,
          "", // código natureza operação
          valorSped(vlBcIcms),
          valorSped(aliq),
          valorSped(vlIcms),
          valorSped(0), // BC ICMS-ST
          valorSped(0), // alíquota ST
          valorSped(0), // ICMS-ST
          "0", // IND_APUR IPI
          "",  // CST IPI
          "",  // código enquadramento IPI
          "",  // BC IPI
          "",  // alíquota IPI
          "",  // valor IPI
          it.produto.cstPis ?? "01",
          valorSped(vlOperacao),
          valorSped(Number(it.produto.pisAliquota ?? 0)),
          "", // quantidade BC PIS
          "", // alíquota PIS em reais
          valorSped((vlOperacao * Number(it.produto.pisAliquota ?? 0)) / 100),
          it.produto.cstCofins ?? "01",
          valorSped(vlOperacao),
          valorSped(Number(it.produto.cofinsAliquota ?? 0)),
          "", // quantidade BC COFINS
          "", // alíquota COFINS em reais
          valorSped((vlOperacao * Number(it.produto.cofinsAliquota ?? 0)) / 100),
          "", // código da conta contábil
        ),
      );

      const chave = `${cst}|${cfop}|${aliq}`;
      const acc = agregadoC190.get(chave) ?? { cst, cfop, aliq, vlOpr: 0, vlBc: 0, vlIcms: 0 };
      acc.vlOpr += vlOperacao;
      acc.vlBc += vlBcIcms;
      acc.vlIcms += vlIcms;
      agregadoC190.set(chave, acc);
    }

    // C190: registro analítico do documento (obrigatório por C100)
    for (const g of agregadoC190.values()) {
      blocoC.push(
        pipe(
          "C190",
          g.cst,
          g.cfop,
          valorSped(g.aliq),
          valorSped(g.vlOpr),
          valorSped(g.vlBc),
          valorSped(g.vlIcms),
          valorSped(0), // BC ICMS-ST
          valorSped(0), // ICMS-ST
          valorSped(0), // redução de BC
          valorSped(0), // IPI
          "", // código observação
        ),
      );
    }
  }
  fecharBloco(blocoC, "C990");

  // ---------------------------------------------------------------- Bloco D
  // Sem documentos de transporte/comunicação: bloco vazio válido.
  const blocoD: string[] = [];
  blocoD.push(pipe("D001", "1"));
  fecharBloco(blocoD, "D990");

  // ---------------------------------------------------------------- Bloco E
  // Apuração do ICMS: débitos = ICMS das saídas; créditos = ICMS das entradas.
  const entradas = await prisma.notaEntrada.findMany({
    where: {
      fornecedor: { empresaId: opts.empresaId },
      dataEntrada: { gte: opts.inicio, lte: opts.fim },
    },
    include: { itens: { include: { produto: true } } },
  });
  let totalCreditosIcms = 0;
  for (const ne of entradas) {
    for (const it of ne.itens) {
      const aliq = Number(it.produto?.aliquotaIcms ?? 0);
      totalCreditosIcms += (Number(it.valorTotal) * aliq) / 100;
    }
  }
  const saldoApurado = totalDebitosIcms - totalCreditosIcms;
  const blocoE: string[] = [];
  blocoE.push(pipe("E001", "0"));
  blocoE.push(pipe("E100", dataSped(opts.inicio), dataSped(opts.fim)));
  blocoE.push(
    pipe(
      "E110",
      valorSped(totalDebitosIcms),
      valorSped(0), // ajustes a débito (documento)
      valorSped(0), // total ajustes a débito
      valorSped(0), // estornos de crédito
      valorSped(totalCreditosIcms),
      valorSped(0), // ajustes a crédito (documento)
      valorSped(0), // total ajustes a crédito
      valorSped(0), // estornos de débito
      valorSped(0), // saldo credor período anterior
      valorSped(Math.max(0, saldoApurado)), // saldo devedor apurado
      valorSped(0), // deduções
      valorSped(Math.max(0, saldoApurado)), // ICMS a recolher
      valorSped(Math.max(0, -saldoApurado)), // saldo credor a transportar
      valorSped(0), // débitos especiais
    ),
  );
  fecharBloco(blocoE, "E990");

  // ---------------------------------------------------------------- Bloco G
  // CIAP: sem ativo imobilizado cadastrado — bloco sem movimento.
  const blocoG: string[] = [];
  blocoG.push(pipe("G001", "1"));
  fecharBloco(blocoG, "G990");

  // ---------------------------------------------------------------- Bloco H
  // Inventário físico na data final do período (custo médio por produto).
  const estoques = await prisma.estoqueDeposito.findMany({
    where: {
      deposito: { empresaId: opts.empresaId },
      quantidade: { gt: 0 },
    },
    include: { produto: true },
  });
  const estoquePorProduto = new Map<string, { produto: (typeof estoques)[number]["produto"]; quantidade: number }>();
  for (const e of estoques) {
    const acc = estoquePorProduto.get(e.produtoId) ?? { produto: e.produto, quantidade: 0 };
    acc.quantidade += Number(e.quantidade);
    estoquePorProduto.set(e.produtoId, acc);
  }
  const itensInventario = [...estoquePorProduto.values()]
    .map((e) => ({
      produto: e.produto,
      quantidade: e.quantidade,
      custoUnitario: Number(e.produto.custoMedio),
      valorTotal: e.quantidade * Number(e.produto.custoMedio),
    }))
    .sort((a, b) => a.produto.sku.localeCompare(b.produto.sku));
  const valorTotalInventario = itensInventario.reduce((a, i) => a + i.valorTotal, 0);

  const blocoH: string[] = [];
  if (itensInventario.length > 0) {
    blocoH.push(pipe("H001", "0"));
    blocoH.push(
      pipe(
        "H005",
        dataSped(opts.fim),
        valorSped(valorTotalInventario),
        "01", // motivo: 01=final do período
      ),
    );
    for (const item of itensInventario) {
      blocoH.push(
        pipe(
          "H010",
          item.produto.sku.slice(0, 60),
          item.produto.unidade,
          valorSped(item.quantidade),
          valorSped(item.custoUnitario),
          valorSped(item.valorTotal),
          "0", // propriedade: 0=do informante, em seu poder
          "",  // participante
          "",  // complemento
          "",  // código da conta contábil
          valorSped(item.valorTotal), // valor para fins de IR
        ),
      );
    }
  } else {
    blocoH.push(pipe("H001", "1"));
  }
  fecharBloco(blocoH, "H990");

  // ---------------------------------------------------------------- Bloco 1
  // Outras informações: sem dados no período — bloco vazio válido.
  const bloco1: string[] = [];
  bloco1.push(pipe("1001", "1"));
  fecharBloco(bloco1, "1990");

  // ---------------------------------------------------------------- Bloco 9
  const blocos = [bloco0, blocoC, blocoD, blocoE, blocoG, blocoH, bloco1];
  const bloco9 = montarBloco9(blocos);

  return [...blocos.flat(), ...bloco9].join("\r\n") + "\r\n";
}
