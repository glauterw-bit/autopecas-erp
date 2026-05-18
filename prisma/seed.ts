import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("→ Limpando dados anteriores...");
  await prisma.$transaction([
    prisma.itemVenda.deleteMany(),
    prisma.pagamentoVenda.deleteMany(),
    prisma.venda.deleteMany(),
    prisma.movimentoEstoque.deleteMany(),
    prisma.estoqueDeposito.deleteMany(),
    prisma.aplicacaoVeicular.deleteMany(),
    prisma.crossReference.deleteMany(),
    prisma.produto.deleteMany(),
    prisma.categoriaPeca.deleteMany(),
    prisma.marca.deleteMany(),
    prisma.versaoVeiculo.deleteMany(),
    prisma.modeloVeiculo.deleteMany(),
    prisma.montadora.deleteMany(),
    prisma.veiculoCliente.deleteMany(),
    prisma.cliente.deleteMany(),
    prisma.fornecedor.deleteMany(),
    prisma.deposito.deleteMany(),
    prisma.filial.deleteMany(),
    prisma.usuario.deleteMany(),
    prisma.empresa.deleteMany(),
  ]);

  console.log("→ Empresa, filial, depósito, usuário...");
  const empresa = await prisma.empresa.create({
    data: {
      razaoSocial: "AutoPeças Demo LTDA",
      nomeFantasia: "AutoPeças Demo",
      cnpj: "00000000000100",
      regimeTributario: "SIMPLES_NACIONAL",
      uf: "SP",
      municipio: "São Paulo",
      email: "contato@autopecasdemo.com.br",
      filiais: {
        create: [{ nome: "Matriz" }],
      },
      depositos: {
        create: [{ nome: "Loja", tipo: "LOJA" }, { nome: "CD", tipo: "CENTRO_DISTRIBUICAO" }],
      },
      usuarios: {
        create: [
          {
            nome: "Admin Demo",
            email: "admin@autopecasdemo.com.br",
            senhaHash: "$2a$10$placeholder",
            perfil: "ADMIN",
          },
          {
            nome: "Vendedor Demo",
            email: "vendedor@autopecasdemo.com.br",
            senhaHash: "$2a$10$placeholder",
            perfil: "VENDEDOR",
          },
        ],
      },
    },
    include: { depositos: true },
  });

  console.log("→ Catálogo veicular (montadora/modelo/versão)...");
  const montadoras = [
    {
      nome: "Chevrolet",
      modelos: [
        { nome: "Onix", versoes: ["1.0 LT", "1.0 LTZ Turbo", "1.4 LT"] },
        { nome: "S10", versoes: ["2.8 Diesel 4x4 LTZ"] },
      ],
    },
    {
      nome: "Volkswagen",
      modelos: [
        { nome: "Gol", versoes: ["1.0 MPI", "1.6 Comfortline"] },
        { nome: "Polo", versoes: ["1.0 200 TSI", "1.6 MSI"] },
      ],
    },
    {
      nome: "Honda",
      modelos: [
        { nome: "Civic", versoes: ["2.0 LXR", "2.0 EXL CVT"] },
        { nome: "CG 160", versoes: ["Titan", "Fan"] },
      ],
    },
    {
      nome: "Fiat",
      modelos: [
        { nome: "Strada", versoes: ["1.3 Endurance", "1.4 Freedom"] },
        { nome: "Uno", versoes: ["1.0 Attractive"] },
      ],
    },
    {
      nome: "Toyota",
      modelos: [{ nome: "Corolla", versoes: ["2.0 XEi", "1.8 Hybrid"] }],
    },
  ];

  const versoesMap: Record<string, string> = {};
  for (const m of montadoras) {
    const mont = await prisma.montadora.create({ data: { nome: m.nome } });
    for (const mod of m.modelos) {
      const modelo = await prisma.modeloVeiculo.create({
        data: { montadoraId: mont.id, nome: mod.nome },
      });
      for (const v of mod.versoes) {
        const versao = await prisma.versaoVeiculo.create({
          data: {
            modeloId: modelo.id,
            descricao: v,
            anoInicio: 2010,
            anoFim: 2026,
            combustivel: "FLEX",
          },
        });
        versoesMap[`${m.nome}|${mod.nome}|${v}`] = versao.id;
      }
    }
  }

  console.log("→ Categorias e marcas...");
  const catFreio = await prisma.categoriaPeca.create({
    data: { nome: "Pastilha de Freio", sistema: "FREIO" },
  });
  const catOleo = await prisma.categoriaPeca.create({
    data: { nome: "Óleo Lubrificante", sistema: "LUBRIFICANTES" },
  });
  const catFiltro = await prisma.categoriaPeca.create({
    data: { nome: "Filtro de Óleo", sistema: "MOTOR" },
  });
  const catVela = await prisma.categoriaPeca.create({
    data: { nome: "Vela de Ignição", sistema: "IGNICAO" },
  });
  const catAmort = await prisma.categoriaPeca.create({
    data: { nome: "Amortecedor", sistema: "SUSPENSAO" },
  });
  const catBateria = await prisma.categoriaPeca.create({
    data: { nome: "Bateria", sistema: "ELETRICA" },
  });

  const marcas = await Promise.all([
    prisma.marca.create({ data: { nome: "Bosch", oem: true, premium: true } }),
    prisma.marca.create({ data: { nome: "NGK", oem: true } }),
    prisma.marca.create({ data: { nome: "Cofap", oem: false } }),
    prisma.marca.create({ data: { nome: "Mahle", oem: true } }),
    prisma.marca.create({ data: { nome: "Tecfil" } }),
    prisma.marca.create({ data: { nome: "Mobil" } }),
    prisma.marca.create({ data: { nome: "Moura", premium: true } }),
    prisma.marca.create({ data: { nome: "Fras-le", oem: true } }),
  ]);

  console.log("→ Produtos com aplicação veicular...");
  const produtosData = [
    {
      sku: "PF-001",
      nome: "Pastilha de Freio Dianteira Onix/Cobalt",
      categoriaId: catFreio.id,
      marcaId: marcas[7].id,
      codigoOem: "13501314",
      codigoFabricante: "PD/1083",
      custo: 38.5,
      preco: 89.9,
      ncm: "87083090",
      aplicacoes: ["Chevrolet|Onix|1.0 LT", "Chevrolet|Onix|1.4 LT"],
    },
    {
      sku: "PF-002",
      nome: "Pastilha de Freio Dianteira Civic 2007-2016",
      categoriaId: catFreio.id,
      marcaId: marcas[0].id,
      codigoOem: "45022-SNA-A00",
      codigoFabricante: "BP-1100",
      custo: 95.0,
      preco: 219.9,
      ncm: "87083090",
      aplicacoes: ["Honda|Civic|2.0 LXR", "Honda|Civic|2.0 EXL CVT"],
    },
    {
      sku: "OL-005W30",
      nome: "Óleo Mobil Super 5W-30 1L Sintético",
      categoriaId: catOleo.id,
      marcaId: marcas[5].id,
      codigoFabricante: "MS5W30",
      custo: 28.0,
      preco: 54.9,
      ncm: "27101232",
      unidade: "L",
      aplicacoes: [],
    },
    {
      sku: "FO-100",
      nome: "Filtro de Óleo Motor 1.0/1.4 GM/VW",
      categoriaId: catFiltro.id,
      marcaId: marcas[4].id,
      codigoFabricante: "PSL985",
      custo: 12.5,
      preco: 32.9,
      ncm: "84212300",
      aplicacoes: ["Chevrolet|Onix|1.0 LT", "Volkswagen|Gol|1.0 MPI"],
    },
    {
      sku: "VE-NGK-04",
      nome: "Jogo de Velas NGK Iridium IX 4 peças",
      categoriaId: catVela.id,
      marcaId: marcas[1].id,
      codigoFabricante: "BKR6EIX-11",
      custo: 79.0,
      preco: 169.9,
      ncm: "85111000",
      unidade: "JG",
      aplicacoes: ["Honda|Civic|2.0 LXR", "Toyota|Corolla|2.0 XEi"],
    },
    {
      sku: "AM-PAR-DI",
      nome: "Par de Amortecedores Dianteiros Gol G6/G7",
      categoriaId: catAmort.id,
      marcaId: marcas[2].id,
      codigoFabricante: "GP-32847",
      custo: 380.0,
      preco: 749.9,
      ncm: "87088000",
      unidade: "PAR",
      aplicacoes: ["Volkswagen|Gol|1.0 MPI", "Volkswagen|Gol|1.6 Comfortline"],
    },
    {
      sku: "BAT-60AH",
      nome: "Bateria Moura 60Ah Selada 12V",
      categoriaId: catBateria.id,
      marcaId: marcas[6].id,
      codigoFabricante: "M60GD",
      custo: 320.0,
      preco: 499.9,
      ncm: "85071000",
      garantiaMeses: 18,
      aplicacoes: [
        "Chevrolet|Onix|1.0 LT",
        "Volkswagen|Gol|1.0 MPI",
        "Fiat|Strada|1.3 Endurance",
        "Honda|Civic|2.0 LXR",
      ],
    },
  ];

  const deposito = empresa.depositos[0];

  for (const p of produtosData) {
    const produto = await prisma.produto.create({
      data: {
        empresaId: empresa.id,
        sku: p.sku,
        nome: p.nome,
        categoriaId: p.categoriaId,
        marcaId: p.marcaId,
        codigoOem: (p as { codigoOem?: string }).codigoOem ?? null,
        codigoFabricante: p.codigoFabricante,
        unidade: p.unidade ?? "UN",
        custoMedio: p.custo,
        precoVenda: p.preco,
        margemAlvo: 0.35,
        precoMinimo: p.custo * 1.15,
        ncm: p.ncm,
        cstIcms: "102",
        origemFiscal: 0,
        estoqueMinimo: 5,
        leadTimeDias: 7,
        curva: p.preco > 200 ? "A" : p.preco > 80 ? "B" : "C",
        garantiaMeses: (p as { garantiaMeses?: number }).garantiaMeses ?? 3,
      },
    });

    // estoque inicial
    await prisma.estoqueDeposito.create({
      data: {
        produtoId: produto.id,
        depositoId: deposito.id,
        quantidade: Math.floor(Math.random() * 30) + 5,
      },
    });

    // aplicações veiculares
    for (const apl of p.aplicacoes) {
      const versaoId = versoesMap[apl];
      if (!versaoId) continue;
      await prisma.aplicacaoVeicular.create({
        data: {
          produtoId: produto.id,
          versaoId,
          posicao: p.categoriaId === catFreio.id ? "DIANTEIRA" : null,
        },
      });
    }
  }

  console.log("→ Clientes...");
  const clienteJoao = await prisma.cliente.create({
    data: {
      empresaId: empresa.id,
      tipo: "PF",
      cpfCnpj: "12345678901",
      nome: "João Mecânico",
      telefone: "(11) 99999-1234",
      whatsapp: "5511999991234",
      segmento: "MECANICA",
      limiteCredito: 5000,
      scoreCredito: 0.82,
    },
  });
  await prisma.veiculoCliente.create({
    data: {
      clienteId: clienteJoao.id,
      placa: "ABC1D23",
      ano: 2015,
      anoModelo: 2015,
      cor: "Prata",
      versaoId: versoesMap["Honda|Civic|2.0 LXR"],
    },
  });

  await prisma.cliente.create({
    data: {
      empresaId: empresa.id,
      tipo: "PJ",
      cpfCnpj: "12345678000190",
      nome: "Frotas SP Locadora",
      email: "compras@frotas-sp.com.br",
      segmento: "FROTISTA",
      limiteCredito: 50000,
      scoreCredito: 0.95,
    },
  });

  console.log("→ Fornecedores...");
  await prisma.fornecedor.createMany({
    data: [
      {
        empresaId: empresa.id,
        cnpjCpf: "11222333000111",
        razaoSocial: "Distribuidora Centro-Oeste",
        nomeFantasia: "DCO Peças",
        email: "vendas@dco.com.br",
        prazoEntregaDias: 4,
        pontualidade: 0.92,
      },
      {
        empresaId: empresa.id,
        cnpjCpf: "44555666000122",
        razaoSocial: "Importadora ItalPart",
        nomeFantasia: "ItalPart",
        email: "comercial@italpart.com.br",
        prazoEntregaDias: 14,
        pontualidade: 0.75,
      },
    ],
  });

  console.log("→ Insights de IA de exemplo...");
  await prisma.insightIA.createMany({
    data: [
      {
        empresaId: empresa.id,
        tipo: "RUPTURA_PREDITIVA",
        severidade: "CRITICO",
        titulo: "Risco de ruptura: Pastilha de Freio Onix",
        descricao:
          "Cobertura de 4 dias com média de 1.2/dia. Tempo de entrega do fornecedor: 7 dias.",
        acaoSugerida: "Comprar 28 unidades para repor 21 dias de demanda.",
      },
      {
        empresaId: empresa.id,
        tipo: "MARGEM_BAIXA",
        severidade: "AVISO",
        titulo: "Margem baixa: Óleo Mobil 5W-30",
        descricao: "Margem média 9% em 12 vendas nos últimos 30 dias.",
        acaoSugerida: "Revisar preço ou renegociar custo.",
      },
      {
        empresaId: empresa.id,
        tipo: "OPORTUNIDADE_PRECO",
        severidade: "INFO",
        titulo: "Bateria Moura 60Ah pode subir preço",
        descricao: "Concorrentes ML estão 8% acima da loja.",
        acaoSugerida: "Avaliar reajuste para R$ 539,90.",
      },
    ],
  });

  console.log("✓ Seed concluído.");
  console.log(`   Empresa: ${empresa.nomeFantasia}`);
  console.log(`   Produtos: ${produtosData.length}`);
  console.log(`   Montadoras: ${montadoras.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
