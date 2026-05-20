import { prisma } from "../db";

// SPED Contribuições (EFD-Contribuições)
// ======================================
// Escrituração das contribuições PIS/Pasep e COFINS, obrigatória para
// empresas no Lucro Real e Lucro Presumido com receita > R$ 78M/ano.
// Cobre regime cumulativo e não-cumulativo.
//
// Blocos principais:
//   0 — Abertura e identificação
//   A — Documentos fiscais de serviços
//   C — Documentos de venda (NF-e/NFC-e)
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

export async function gerarSpedContribuicoes(opts: {
  empresaId: string;
  inicio: Date;
  fim: Date;
}): Promise<string> {
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: opts.empresaId },
  });

  const linhas: string[] = [];

  // 0000 — Abertura
  linhas.push(
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
      empresa.regimeTributario === "LUCRO_REAL" ? "1" : "2",
      "1",   // tipo apuração contribuição: 1=mensal
      "1",   // critério apropriação crédito: 1=alocação direta
      empresa.regimeTributario === "LUCRO_REAL" ? "1" : "2",
      "",    // SCP
    ),
  );

  linhas.push(pipe("0001", "0"));

  // 0110 — Regimes de apuração da contribuição social
  linhas.push(
    pipe(
      "0110",
      empresa.regimeTributario === "LUCRO_REAL" ? "1" : "2", // 1=não-cumulativo, 2=cumulativo
      "1", // método rateio crédito comum
      empresa.regimeTributario === "LUCRO_REAL" ? "2" : "1", // 1=competência, 2=caixa
      "",
    ),
  );

  // 0140 — Cadastro do estabelecimento (matriz)
  linhas.push(
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

  // Bloco A — não usado para auto peças (serviços apenas)
  linhas.push(pipe("A001", "1")); // 1=sem dados

  // Bloco C — Documentos fiscais de venda
  linhas.push(pipe("C001", "0"));
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

  let totalReceita = 0;
  let totalPis = 0;
  let totalCofins = 0;

  for (const nf of notas) {
    linhas.push(
      pipe(
        "C100",
        "1", // saída
        "0", // próprio
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
        valor(0),
        valor(Number(nf.valorProdutos)),
        "1",
        valor(Number(nf.valorFrete)),
        valor(0),
        valor(0),
        valor(Number(nf.valorIpi)),
        valor(Number(nf.valorPis)),
        valor(Number(nf.valorCofins)),
        valor(Number(nf.valorIcms)),
        valor(Number(nf.valorIcmsSt)),
      ),
    );
    totalReceita += Number(nf.valorTotal);
    totalPis += Number(nf.valorPis);
    totalCofins += Number(nf.valorCofins);

    // C170: itens — para apuração de PIS/COFINS por NCM
    let n = 0;
    for (const it of nf.venda?.itens ?? []) {
      n++;
      const aliqPis = empresa.regimeTributario === "LUCRO_REAL" ? 1.65 : 0.65;
      const aliqCofins = empresa.regimeTributario === "LUCRO_REAL" ? 7.6 : 3.0;
      const basePis = Number(it.total);
      const valorPisItem = (basePis * aliqPis) / 100;
      const valorCofinsItem = (basePis * aliqCofins) / 100;
      linhas.push(
        pipe(
          "C170",
          n,
          it.produto.sku.slice(0, 60),
          it.produto.nome.slice(0, 255),
          valor(Number(it.quantidade)),
          it.produto.unidade,
          valor(Number(it.total)),
          valor(Number(it.desconto)),
          "0",
          "5102",
          it.produto.cstIcms ?? "102",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          it.produto.cstPis ?? "01",
          valor(basePis),
          valor(aliqPis),
          "BRL",
          "",
          valor(valorPisItem),
          it.produto.cstCofins ?? "01",
          valor(basePis),
          valor(aliqCofins),
          "BRL",
          "",
          valor(valorCofinsItem),
          it.produto.ncm ?? "",
        ),
      );
    }
  }

  // Bloco M — Apuração mensal
  linhas.push(pipe("M001", "0"));
  linhas.push(pipe("M200", valor(totalPis), valor(0), valor(0), valor(0), valor(totalPis), valor(0), valor(totalPis), valor(0)));
  linhas.push(pipe("M600", valor(totalCofins), valor(0), valor(0), valor(0), valor(totalCofins), valor(0), valor(totalCofins), valor(0)));

  // Bloco 9 — encerramento
  linhas.push(pipe("9001", "0"));
  linhas.push(pipe("9900", "0000", "1"));
  linhas.push(pipe("9990", String(linhas.length + 1)));
  linhas.push(pipe("9999", String(linhas.length + 1)));

  return linhas.join("\r\n") + "\r\n";
}
