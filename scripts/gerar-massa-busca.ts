/**
 * Gera massa SINTÉTICA para medir a busca de peças (50 mil produtos).
 *
 * - Só roda se DATABASE_URL apontar para localhost/127.0.0.1 (nunca em produção).
 * - Tudo fica numa empresa de teste própria (CNPJ 99.999.999/0001-99) e a
 *   descrição de cada produto começa com "TESTE ". Marcas, montadoras e
 *   modelos criados aqui também começam com "TESTE ".
 * - Idempotente: apaga a empresa de teste (cascade) e recria.
 *
 * Uso:
 *   DATABASE_URL=postgresql://usuario@localhost:5432/banco_local npx tsx scripts/gerar-massa-busca.ts [qtdProdutos]
 *
 * Volume padrão: 50.000 produtos, 4 códigos por produto (SKU, EAN, fabricante,
 * OEM = 200 mil códigos), ~2 aplicações por produto (~100 mil) e 1 linha de
 * estoque por produto.
 */
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
let host = "";
try {
  host = new URL(url).hostname;
} catch {
  /* url inválida */
}
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error("[massa-busca] Recusado: DATABASE_URL não aponta para localhost.");
  process.exit(1);
}

const QTD = Number(process.argv[2] ?? 50_000);
const EMPRESA_ID = "teste-busca-empresa";
const DEPOSITO_ID = "teste-busca-deposito";

const prisma = new PrismaClient();

const MONTADORAS: Record<string, string[]> = {
  "TESTE Mercedes-Benz": ["Sprinter", "Accelo", "Vito"],
  "TESTE Renault": ["Master", "Kangoo", "Duster"],
  "TESTE Fiat": ["Ducato", "Fiorino", "Strada", "Toro"],
  "TESTE Iveco": ["Daily"],
  "TESTE Peugeot": ["Boxer", "Partner"],
  "TESTE Citroen": ["Jumper", "Jumpy"],
  "TESTE Ford": ["Transit", "Ranger", "Cargo"],
  "TESTE Volkswagen": ["Amarok", "Delivery", "Gol", "Saveiro"],
  "TESTE Chevrolet": ["S10", "Onix", "Montana"],
  "TESTE Toyota": ["Hilux"],
  "TESTE Hyundai": ["HR"],
  "TESTE Kia": ["Bongo"],
};

const PECAS = [
  "PASTILHA FREIO", "DISCO FREIO", "LONA FREIO", "TAMBOR FREIO", "CILINDRO RODA",
  "FILTRO OLEO", "FILTRO AR", "FILTRO COMBUSTIVEL", "FILTRO CABINE", "AMORTECEDOR",
  "MOLA SUSPENSAO", "BIELETA", "PIVO SUSPENSAO", "BANDEJA SUSPENSAO", "TERMINAL DIRECAO",
  "BARRA AXIAL", "ROLAMENTO RODA", "CUBO RODA", "JUNTA HOMOCINETICA", "COIFA HOMOCINETICA",
  "KIT EMBREAGEM", "ATUADOR EMBREAGEM", "CORREIA DENTADA", "TENSOR CORREIA", "CORREIA POLY V",
  "BOMBA AGUA", "VALVULA TERMOSTATICA", "RADIADOR", "MANGUEIRA RADIADOR", "BICO INJETOR",
  "BOMBA COMBUSTIVEL", "SENSOR ROTACAO", "SENSOR TEMPERATURA", "VELA AQUECEDORA", "JUNTA CABECOTE",
  "RETENTOR VIRABREQUIM", "COXIM MOTOR", "LAMPADA FAROL", "PALHETA LIMPADOR", "ÓLEO MOTOR 15W40",
];
const POSICOES = ["DIANTEIRA", "TRASEIRA", "DIANT ESQ", "DIANT DIR", "", "", ""];
const MARCAS = [
  "Bosch", "Cofap", "Nakata", "Monroe", "Fras-le", "Cobreq", "TRW", "SKF", "Mahle", "Tecfil",
  "Wega", "Fram", "Mann", "Sachs", "Luk", "Valeo", "Gates", "Contitech", "Dayco", "NGK",
  "Delphi", "Denso", "Magneti Marelli", "Urba", "Viemar", "Sampel", "Axios", "Hipper Freios",
  "Schadek", "Original",
];

async function main() {
  console.log(`[massa-busca] gerando ${QTD} produtos em ${host}…`);
  await prisma.$executeRawUnsafe(`DELETE FROM empresas WHERE id = '${EMPRESA_ID}'`);
  await prisma.empresa.create({
    data: {
      id: EMPRESA_ID,
      razaoSocial: "TESTE Empresa Massa de Busca",
      nomeFantasia: "TESTE Busca 50k",
      cnpj: "99.999.999/0001-99",
    },
  });
  await prisma.deposito.create({
    data: { id: DEPOSITO_ID, empresaId: EMPRESA_ID, nome: "TESTE Loja" },
  });

  // Catálogo global (marcas e veículos) marcado com "TESTE ".
  for (const m of MARCAS) {
    await prisma.marca.upsert({ where: { nome: `TESTE ${m}` }, update: {}, create: { nome: `TESTE ${m}` } });
  }
  for (const [montadora, modelos] of Object.entries(MONTADORAS)) {
    const mt = await prisma.montadora.upsert({ where: { nome: montadora }, update: {}, create: { nome: montadora } });
    for (const modelo of modelos) {
      const md = await prisma.modeloVeiculo.upsert({
        where: { montadoraId_nome: { montadoraId: mt.id, nome: modelo } },
        update: {},
        create: { montadoraId: mt.id, nome: modelo },
      });
      const existentes = await prisma.versaoVeiculo.count({ where: { modeloId: md.id } });
      if (existentes > 0) continue;
      // 6 versões por modelo, em faixas de ano de 2000 a 2026.
      for (let v = 0; v < 6; v++) {
        const ini = 2000 + v * 4;
        await prisma.versaoVeiculo.create({
          data: {
            modeloId: md.id,
            descricao: `TESTE ${modelo} ${["2.2", "2.3", "2.5", "2.8", "3.0", "1.6"][v]} ${ini}-${ini + 4}`,
            anoInicio: ini,
            anoFim: ini + 4,
            combustivel: "DIESEL",
          },
        });
      }
    }
  }

  const arr = (xs: string[]) => `ARRAY[${xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(",")}]`;
  const todosModelos = Object.values(MONTADORAS).flat();

  // Produtos em SQL (generate_series) para gerar 50 mil linhas em segundos.
  await prisma.$executeRawUnsafe(`
    WITH s AS (
      SELECT i,
             (${arr(PECAS)})[1 + (i * 7) % ${PECAS.length}] AS peca,
             (${arr(POSICOES)})[1 + (i * 3) % ${POSICOES.length}] AS pos,
             (${arr(todosModelos)})[1 + (i * 11) % ${todosModelos.length}] AS modelo,
             (${arr(MARCAS)})[1 + (i * 13) % ${MARCAS.length}] AS marca,
             2000 + (i % 6) * 4 AS ano
        FROM generate_series(1, ${QTD}) AS i
    )
    INSERT INTO produtos (id, "empresaId", sku, "codigoBarras", "codigoFabricante", "codigoOem",
                          nome, "marcaId", "custoMedio", "precoVenda", ativo, "atualizadoEm")
    SELECT 'tb-' || i,
           '${EMPRESA_ID}',
           'T' || lpad(i::text, 6, '0'),
           '789' || lpad(((i::bigint * 7919) % 1000000000)::text, 9, '0') || (i % 10)::text,
           CASE i % 3
             WHEN 0 THEN upper(substr(marca, 1, 2)) || '-' || lpad((i * 37 % 100000)::text, 5, '0')
             WHEN 1 THEN upper(substr(marca, 1, 2)) || '.' || lpad((i * 37 % 1000)::text, 3, '0') || '.' || lpad((i % 100)::text, 2, '0')
             ELSE upper(substr(marca, 1, 3)) || lpad((i * 37 % 100000)::text, 5, '0')
           END,
           CASE i % 4
             WHEN 0 THEN 'A' || lpad((i * 9973 % 1000000000)::text, 10, '0')
             WHEN 1 THEN lpad((i * 131 % 100000)::text, 5, '0') || '-' || upper(substr(md5(i::text), 1, 3)) || '-A00'
             WHEN 2 THEN lpad((i * 17 % 1000)::text, 3, '0') || '.' || lpad((i * 29 % 1000)::text, 3, '0') || '.' || lpad((i % 1000)::text, 3, '0')
             ELSE NULL
           END,
           'TESTE ' || peca || CASE WHEN pos <> '' THEN ' ' || pos ELSE '' END || ' ' || upper(modelo) || ' ' || ano || '/' || (ano + 4),
           (SELECT id FROM marcas WHERE nome = 'TESTE ' || marca),
           (10 + i % 500)::numeric,
           (18 + i % 900)::numeric,
           (i % 50) <> 0,
           now()
      FROM s
  `);

  // ~2 aplicações por produto: a versão do próprio modelo/ano do nome e uma do modelo "irmão".
  await prisma.$executeRawUnsafe(`
    WITH vs AS (
      SELECT v.id, mo.nome AS modelo, v."anoInicio",
             row_number() OVER (ORDER BY v.id) AS rn, count(*) OVER () AS total
        FROM versoes_veiculo v JOIN modelos_veiculo mo ON mo.id = v."modeloId"
        JOIN montadoras mt ON mt.id = mo."montadoraId"
       WHERE mt.nome LIKE 'TESTE %'
    ),
    p AS (
      SELECT p.id, substring(p.id from 4)::int AS i, p.nome FROM produtos p WHERE p."empresaId" = '${EMPRESA_ID}'
    )
    INSERT INTO aplicacoes_veiculares (id, "produtoId", "versaoId", "quantidadePorVeiculo")
    SELECT 'ta-' || p.id || '-1', p.id, vs.id, 1
      FROM p JOIN vs ON upper(vs.modelo) = (${arr(todosModelos.map((m) => m.toUpperCase()))})[1 + (p.i * 11) % ${todosModelos.length}]
                    AND vs."anoInicio" = 2000 + (p.i % 6) * 4
    UNION ALL
    SELECT 'ta-' || p.id || '-2', p.id, vs.id, 1
      FROM p JOIN vs ON vs.rn = 1 + (p.i * 31) % vs.total
     WHERE p.i % 10 <> 0
    ON CONFLICT DO NOTHING
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO estoque_deposito (id, "produtoId", "depositoId", quantidade, reservado, "atualizadoEm")
    SELECT 'te-' || p.id, p.id, '${DEPOSITO_ID}', (substring(p.id from 4)::int % 25), 0, now()
      FROM produtos p WHERE p."empresaId" = '${EMPRESA_ID}'
  `);

  for (const t of ["produtos", "aplicacoes_veiculares", "estoque_deposito", "marcas", "versoes_veiculo"]) {
    await prisma.$executeRawUnsafe(`ANALYZE ${t}`);
  }

  const [prod, apl] = await Promise.all([
    prisma.produto.count({ where: { empresaId: EMPRESA_ID } }),
    prisma.aplicacaoVeicular.count({ where: { produto: { empresaId: EMPRESA_ID } } }),
  ]);
  console.log(`[massa-busca] ok: ${prod} produtos, ${apl} aplicações, empresa ${EMPRESA_ID}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
