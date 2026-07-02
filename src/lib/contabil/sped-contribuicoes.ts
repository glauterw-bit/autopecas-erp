import { prisma } from "../db";

// SPED Contribuições (EFD-Contribuições)
// ======================================
// Escrituração das contribuições PIS/Pasep e COFINS, obrigatória para
// empresas no Lucro Real e Lucro Presumido com receita > R$ 78M/ano.
// Cobre regime cumulativo e não-cumulativo (com créditos sobre aquisições
// de mercadorias para revenda — notas de entrada).
//
// Blocos principais:
//   0 — Abertura e identificação
//   A — Documentos fiscais de serviços
//   C — Documentos de venda/compra (NF-e/NFC-e)
//   D — Documentos de transporte
//   F — Demais documentos e operações
//   M — Apuração mensal de PIS/COFINS
//   1 — Complemento de escrituração
//   9 — Controle e encerramento

function pipe(...campos: (string | number | null | undefined)[]) {
  return "|" + campos.map((c) => (c === null || c === undefined ? "" : String(c))).join("|") + "|";
}
function dataSped(d: Date | null | undefined): string {
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}${d.getFullYear()}`;
}
function valor(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

// Alíquota em percentual com 4 casas (padrão dos campos ALIQ_PIS/ALIQ_COFINS)
function aliquota(n: number): string {
  return n.toFixed(4).replace(".", ",");
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

export async function gerarSpedContribuicoes(opts: {
  empresaId: string;
  inicio: Date;
  fim: Date;
}): Promise<string> {
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: opts.empresaId },
  });
  const naoCumulativo = empresa.regimeTributario === "LUCRO_REAL";
  const aliqPis = naoCumulativo ? 1.65 : 0.65;
  const aliqCofins = naoCumulativo ? 7.6 : 3.0;

  // ------------------------------------------------------------ Dados fiscais
  // Saídas (vendas com NF autorizada no período)
  const notas = await prisma.notaFiscal.findMany({
    where: {
      empresaId: opts.empresaId,
      dataEmissao: { gte: opts.inicio, lte: opts.fim },
      status: "AUTORIZADA",
      modelo: { in: ["NFE_55", "NFCE_65"] },
    },
    include: {
      venda: { include: { itens: { include: { produto: true } } } },
    },
    orderBy: { dataEmissao: "asc" },
  });

  // Entradas (crédito de PIS/COFINS no regime não-cumulativo)
  // NotaEntrada não tem empresaId direto: o tenant vem de fornecedor.empresaId.
  const entradas = naoCumulativo
    ? await prisma.notaEntrada.findMany({
        where: {
          fornecedor: { empresaId: opts.empresaId },
          dataEntrada: { gte: opts.inicio, lte: opts.fim },
        },
        include: { itens: true, fornecedor: true },
        orderBy: { dataEntrada: "asc" },
      })
    : [];

  let totalReceita = 0;
  let totalPis = 0;      // contribuição apurada nas saídas
  let totalCofins = 0;
  let baseCreditos = 0;  // base de cálculo dos créditos (entradas)
  let creditoPis = 0;
  let creditoCofins = 0;

  for (const nf of notas) {
    totalReceita += Number(nf.valorTotal);
    for (const it of nf.venda?.itens ?? []) {
      const base = Number(it.total);
      totalPis += (base * aliqPis) / 100;
      totalCofins += (base * aliqCofins) / 100;
    }
  }
  for (const ne of entradas) {
    for (const it of ne.itens) {
      const base = Number(it.valorTotal);
      baseCreditos += base;
      creditoPis += (base * aliqPis) / 100;
      creditoCofins += (base * aliqCofins) / 100;
    }
  }

  // ---------------------------------------------------------------- Bloco 0
  const bloco0: string[] = [];
  bloco0.push(
    pipe(
      "0000",
      "006", // versão leiaute
      "0",   // finalidade: 0=original
      dataSped(opts.inicio),
      dataSped(opts.fim),
      empresa.razaoSocial,
      empresa.cnpj,
      empresa.uf,
      "",    // código IBGE município
      empresa.inscMunicipal,
      empresa.inscEstadual,
      "0",   // tipo escrituração: 0=original
      "0",   // indicador situação especial
      naoCumulativo ? "1" : "2",
      "1",   // tipo apuração contribuição: 1=mensal
      "1",   // critério apropriação crédito: 1=alocação direta
      naoCumulativo ? "1" : "2",
      "",    // SCP
    ),
  );

  bloco0.push(pipe("0001", "0"));

  // 0100 — Contabilista (dados de empresa.configuracoes.contabilista ou placeholder)
  const config = (empresa.configuracoes as Record<string, any> | null) ?? {};
  const contabilista = (config.contabilista ?? {}) as Record<string, string>;
  const cep = (empresa.cep ?? "").replace(/\D/g, "");
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

  // 0110 — Regimes de apuração da contribuição social
  bloco0.push(
    pipe(
      "0110",
      naoCumulativo ? "1" : "2", // 1=não-cumulativo, 2=cumulativo
      "1", // método rateio crédito comum
      naoCumulativo ? "2" : "1", // 1=competência, 2=caixa
      "",
    ),
  );

  // 0111 — Receita bruta do período segregada
  bloco0.push(
    pipe(
      "0111",
      valor(naoCumulativo ? totalReceita : 0), // não-cumulativa tributada MI
      valor(0), // não-cumulativa não tributada MI
      valor(0), // não-cumulativa exportação
      valor(naoCumulativo ? 0 : totalReceita), // cumulativa
      valor(totalReceita), // total
    ),
  );

  // 0140 — Cadastro do estabelecimento (matriz)
  bloco0.push(
    pipe(
      "0140",
      empresa.cnpj.slice(0, 8),
      empresa.razaoSocial,
      empresa.cnpj,
      empresa.uf,
      empresa.inscEstadual,
      "", // IBGE
      empresa.inscMunicipal,
      "",
    ),
  );

  // 0500 — Plano de contas referencial mínimo
  bloco0.push(
    pipe(
      "0500",
      dataSped(opts.inicio),
      "01", // natureza: contas de ativo
      "A",  // analítica
      "3",
      "1.1.3.01",
      "ESTOQUE DE MERCADORIAS PARA REVENDA",
      "", // conta referencial
      "", // CNPJ estabelecimento
    ),
  );
  bloco0.push(
    pipe(
      "0500",
      dataSped(opts.inicio),
      "04", // natureza: contas de resultado
      "A",  // analítica
      "3",
      "3.1.1.01",
      "RECEITA BRUTA DE VENDAS DE MERCADORIAS",
      "", // conta referencial
      "", // CNPJ estabelecimento
    ),
  );
  fecharBloco(bloco0, "0990");

  // ---------------------------------------------------------------- Bloco A
  // Serviços: não usado para auto peças — bloco vazio válido.
  const blocoA: string[] = [];
  blocoA.push(pipe("A001", "1")); // 1=sem dados
  fecharBloco(blocoA, "A990");

  // ---------------------------------------------------------------- Bloco C
  const blocoC: string[] = [];
  blocoC.push(pipe("C001", "0"));
  // C010 — identificação do estabelecimento a que se referem os documentos
  blocoC.push(pipe("C010", empresa.cnpj, "1")); // 1=escrituração detalhada (C100)

  // C100/C170 — Saídas (receitas)
  for (const nf of notas) {
    const vlBcIcmsNota = Number(nf.valorIcms) > 0 ? Number(nf.valorProdutos) : 0;
    blocoC.push(
      pipe(
        "C100",
        "1", // saída
        "0", // emissão própria
        "",  // código do participante (opcional aqui)
        nf.modelo === "NFE_55" ? "55" : "65",
        "00", // situação documento
        nf.serie,
        nf.numero,
        nf.chaveAcesso ?? "",
        dataSped(nf.dataEmissao),
        dataSped(nf.dataAutorizacao),
        valor(Number(nf.valorTotal)),
        "0",
        valor(Number(nf.valorDesconto)),
        valor(0), // abatimento não tributado
        valor(Number(nf.valorProdutos)),
        "1",
        valor(Number(nf.valorFrete)),
        valor(0), // seguro
        valor(0), // outras despesas
        valor(vlBcIcmsNota),
        valor(Number(nf.valorIcms)),
        valor(0), // BC ICMS-ST
        valor(Number(nf.valorIcmsSt)),
        valor(Number(nf.valorIpi)),
        valor(Number(nf.valorPis)),
        valor(Number(nf.valorCofins)),
        valor(0), // PIS-ST
        valor(0), // COFINS-ST
      ),
    );

    // C170: itens — para apuração de PIS/COFINS por item
    let n = 0;
    for (const it of nf.venda?.itens ?? []) {
      n++;
      const basePis = Number(it.total);
      const valorPisItem = (basePis * aliqPis) / 100;
      const valorCofinsItem = (basePis * aliqCofins) / 100;
      blocoC.push(
        pipe(
          "C170",
          n,
          it.produto.sku.slice(0, 60),
          it.produto.nome.slice(0, 255),
          valor(Number(it.quantidade)),
          it.produto.unidade,
          valor(Number(it.total)),
          valor(Number(it.desconto)),
          "0", // IND_MOV
          it.produto.cstIcms ?? "102",
          it.produto.cfopVendaInterna ?? "5102",
          "", // código natureza operação
          valor(0), // BC ICMS
          valor(0), // alíquota ICMS
          valor(0), // valor ICMS
          valor(0), // BC ICMS-ST
          valor(0), // alíquota ST
          valor(0), // ICMS-ST
          "0", // IND_APUR IPI
          "",  // CST IPI
          "",  // código enquadramento IPI
          "",  // BC IPI
          "",  // alíquota IPI
          "",  // valor IPI
          it.produto.cstPis ?? "01",
          valor(basePis),
          aliquota(aliqPis),
          "", // quantidade BC PIS
          "", // alíquota PIS em reais
          valor(valorPisItem),
          it.produto.cstCofins ?? "01",
          valor(basePis),
          aliquota(aliqCofins),
          "", // quantidade BC COFINS
          "", // alíquota COFINS em reais
          valor(valorCofinsItem),
          "", // código da conta contábil
        ),
      );
    }
  }

  // C100/C170 — Entradas (créditos no regime não-cumulativo)
  for (const ne of entradas) {
    let pisNota = 0;
    let cofinsNota = 0;
    for (const it of ne.itens) {
      const base = Number(it.valorTotal);
      pisNota += (base * aliqPis) / 100;
      cofinsNota += (base * aliqCofins) / 100;
    }
    blocoC.push(
      pipe(
        "C100",
        "0", // entrada
        "1", // emissão de terceiros
        "",  // código do participante (opcional aqui)
        "55",
        "00", // situação documento
        ne.serie,
        ne.numero,
        ne.chaveAcesso ?? "",
        dataSped(ne.dataEmissao),
        dataSped(ne.dataEntrada),
        valor(Number(ne.valorTotal)),
        "0",
        valor(Number(ne.valorDesconto)),
        valor(0), // abatimento não tributado
        valor(Number(ne.valorProdutos)),
        "1",
        valor(Number(ne.valorFrete)),
        valor(0), // seguro
        valor(0), // outras despesas
        valor(0), // BC ICMS
        valor(0), // ICMS
        valor(0), // BC ICMS-ST
        valor(Number(ne.valorIcmsSt)),
        valor(Number(ne.valorIpi)),
        valor(pisNota),
        valor(cofinsNota),
        valor(0), // PIS-ST
        valor(0), // COFINS-ST
      ),
    );

    let n = 0;
    for (const it of ne.itens) {
      n++;
      const base = Number(it.valorTotal);
      const pisItem = (base * aliqPis) / 100;
      const cofinsItem = (base * aliqCofins) / 100;
      blocoC.push(
        pipe(
          "C170",
          n,
          (it.produtoId ?? it.codigoFornecedor ?? String(n)).slice(0, 60),
          it.descricaoOriginal.slice(0, 255),
          valor(Number(it.quantidade)),
          it.unidade,
          valor(base),
          valor(0), // desconto do item
          "0", // IND_MOV
          "090", // CST ICMS entrada (simplificado)
          it.cfop ?? "1102",
          "", // código natureza operação
          valor(0), // BC ICMS
          valor(0), // alíquota ICMS
          valor(0), // valor ICMS
          valor(0), // BC ICMS-ST
          valor(0), // alíquota ST
          valor(0), // ICMS-ST
          "0", // IND_APUR IPI
          "",  // CST IPI
          "",  // código enquadramento IPI
          "",  // BC IPI
          "",  // alíquota IPI
          "",  // valor IPI
          "50", // CST PIS: operação com direito a crédito
          valor(base),
          aliquota(aliqPis),
          "", // quantidade BC PIS
          "", // alíquota PIS em reais
          valor(pisItem),
          "50", // CST COFINS: operação com direito a crédito
          valor(base),
          aliquota(aliqCofins),
          "", // quantidade BC COFINS
          "", // alíquota COFINS em reais
          valor(cofinsItem),
          "1.1.3.01", // conta contábil (estoque para revenda — ver 0500)
        ),
      );
    }
  }
  fecharBloco(blocoC, "C990");

  // ---------------------------------------------------------------- Bloco D
  // Transporte: sem dados — bloco vazio válido.
  const blocoD: string[] = [];
  blocoD.push(pipe("D001", "1"));
  fecharBloco(blocoD, "D990");

  // ---------------------------------------------------------------- Bloco F
  // Demais documentos e operações: sem dados — bloco vazio válido.
  const blocoF: string[] = [];
  blocoF.push(pipe("F001", "1"));
  fecharBloco(blocoF, "F990");

  // ---------------------------------------------------------------- Bloco M
  // Apuração: contribuição das saídas − créditos das entradas = a recolher.
  const descontoPis = Math.min(creditoPis, totalPis);
  const saldoCredorPis = creditoPis - descontoPis;
  const pisARecolher = totalPis - descontoPis;
  const descontoCofins = Math.min(creditoCofins, totalCofins);
  const saldoCredorCofins = creditoCofins - descontoCofins;
  const cofinsARecolher = totalCofins - descontoCofins;

  const blocoM: string[] = [];
  blocoM.push(pipe("M001", "0"));

  if (naoCumulativo && creditoPis > 0) {
    // M100 — Crédito de PIS apurado no período
    blocoM.push(
      pipe(
        "M100",
        "101", // código do crédito: alíquota básica, mercado interno
        "0",   // crédito do próprio período
        valor(baseCreditos),
        aliquota(aliqPis),
        "", // quantidade BC
        "", // alíquota em reais
        valor(creditoPis),
        valor(0), // ajustes de acréscimo
        valor(0), // ajustes de redução
        valor(0), // crédito diferido
        valor(creditoPis), // crédito disponível
        saldoCredorPis > 0 ? "1" : "0", // 0=utilização total, 1=parcial
        valor(descontoPis),
        valor(saldoCredorPis),
      ),
    );
    // M105 — Detalhamento da base de cálculo do crédito
    blocoM.push(
      pipe(
        "M105",
        "01", // natureza da BC: aquisição de bens para revenda
        "50", // CST PIS
        valor(baseCreditos), // BC total (escrituração)
        "",  // BC vinculada à receita cumulativa
        valor(baseCreditos), // BC vinculada à receita não-cumulativa
        valor(baseCreditos), // BC do crédito
        "",  // quantidade BC total
        "",  // quantidade BC
        "",  // descrição do ajuste
      ),
    );
  }

  // M200 — Consolidação da contribuição PIS do período
  blocoM.push(
    pipe(
      "M200",
      valor(naoCumulativo ? totalPis : 0),        // contribuição não-cumulativa apurada
      valor(descontoPis),                          // créditos descontados (do período)
      valor(0),                                    // créditos descontados (períodos anteriores)
      valor(naoCumulativo ? pisARecolher : 0),     // contribuição NC devida
      valor(0),                                    // retenções NC
      valor(0),                                    // outras deduções NC
      valor(naoCumulativo ? pisARecolher : 0),     // contribuição NC a recolher
      valor(naoCumulativo ? 0 : totalPis),         // contribuição cumulativa apurada
      valor(0),                                    // retenções cumulativas
      valor(0),                                    // outras deduções cumulativas
      valor(naoCumulativo ? 0 : totalPis),         // contribuição cumulativa a recolher
      valor(naoCumulativo ? pisARecolher : totalPis), // total a recolher
    ),
  );

  if (naoCumulativo && creditoCofins > 0) {
    // M500 — Crédito de COFINS apurado no período
    blocoM.push(
      pipe(
        "M500",
        "101", // código do crédito: alíquota básica, mercado interno
        "0",   // crédito do próprio período
        valor(baseCreditos),
        aliquota(aliqCofins),
        "", // quantidade BC
        "", // alíquota em reais
        valor(creditoCofins),
        valor(0), // ajustes de acréscimo
        valor(0), // ajustes de redução
        valor(0), // crédito diferido
        valor(creditoCofins), // crédito disponível
        saldoCredorCofins > 0 ? "1" : "0", // 0=utilização total, 1=parcial
        valor(descontoCofins),
        valor(saldoCredorCofins),
      ),
    );
    // M505 — Detalhamento da base de cálculo do crédito
    blocoM.push(
      pipe(
        "M505",
        "01", // natureza da BC: aquisição de bens para revenda
        "50", // CST COFINS
        valor(baseCreditos),
        "",
        valor(baseCreditos),
        valor(baseCreditos),
        "",
        "",
        "",
      ),
    );
  }

  // M600 — Consolidação da contribuição COFINS do período
  blocoM.push(
    pipe(
      "M600",
      valor(naoCumulativo ? totalCofins : 0),
      valor(descontoCofins),
      valor(0),
      valor(naoCumulativo ? cofinsARecolher : 0),
      valor(0),
      valor(0),
      valor(naoCumulativo ? cofinsARecolher : 0),
      valor(naoCumulativo ? 0 : totalCofins),
      valor(0),
      valor(0),
      valor(naoCumulativo ? 0 : totalCofins),
      valor(naoCumulativo ? cofinsARecolher : totalCofins),
    ),
  );
  fecharBloco(blocoM, "M990");

  // ---------------------------------------------------------------- Bloco 1
  // Complemento da escrituração: sem dados — bloco vazio válido.
  const bloco1: string[] = [];
  bloco1.push(pipe("1001", "1"));
  fecharBloco(bloco1, "1990");

  // ---------------------------------------------------------------- Bloco 9
  const blocos = [bloco0, blocoA, blocoC, blocoD, blocoF, blocoM, bloco1];
  const bloco9 = montarBloco9(blocos);

  return [...blocos.flat(), ...bloco9].join("\r\n") + "\r\n";
}
