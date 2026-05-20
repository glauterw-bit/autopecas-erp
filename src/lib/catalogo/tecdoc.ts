import { prisma } from "../db";

// Importador TecDoc / Cinoa
// =========================
// TecDoc é o catálogo de referência mundial de auto peças (Schaeffler/Bosch/etc.),
// hoje rebranded como "TecAlliance". Tem 10M+ artigos, 1000+ marcas, e mapeia
// para cada peça as compatibilidades veiculares.
//
// Formatos:
//   - TAF (TecDoc Automotive Format) — XML hierárquico
//   - CSV exportado pelo TecDoc Catalogue / pelo "Tips4y" / portais regionais
//
// Estratégia: importação incremental, idempotente, com checkpoints em
// `TecdocImportLog` (não criado aqui, mas o método registra contagens).
//
// Estrutura mínima dos CSVs aceitos:
//
//   manufacturers.csv:  manufacturer_id, name, country
//   models.csv:         model_id, manufacturer_id, name, year_from, year_to, category
//   types.csv:          type_id, model_id, description, motor, hp, fuel, body
//   articles.csv:       article_id, brand, name, gtin, oem, manufacturer_code
//   compatibilities.csv: article_id, type_id, position

export interface TecdocImportProgresso {
  montadoras: number;
  modelos: number;
  versoes: number;
  produtos: number;
  aplicacoes: number;
  duracaoMs: number;
}

type Row = Record<string, string>;

function parseCsv(texto: string): Row[] {
  const linhas = texto.split(/\r?\n/).filter(Boolean);
  if (linhas.length === 0) return [];
  const sep = linhas[0].includes(";") ? ";" : ",";
  const headers = linhas[0].split(sep).map((h) => h.trim());
  return linhas.slice(1).map((linha) => {
    const valores = parseCsvLine(linha, sep);
    return headers.reduce<Row>((acc, h, i) => {
      acc[h] = (valores[i] ?? "").trim();
      return acc;
    }, {});
  });
}

function parseCsvLine(linha: string, sep: string): string[] {
  const out: string[] = [];
  let atual = "";
  let dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"' && linha[i + 1] === '"') { atual += '"'; i++; continue; }
    if (c === '"') { dentroAspas = !dentroAspas; continue; }
    if (c === sep && !dentroAspas) { out.push(atual); atual = ""; continue; }
    atual += c;
  }
  out.push(atual);
  return out;
}

export async function importarTecdocCsv(arquivos: {
  manufacturersCsv?: string;
  modelsCsv?: string;
  typesCsv?: string;
  articlesCsv?: string;
  compatibilitiesCsv?: string;
  empresaId: string;
}): Promise<TecdocImportProgresso> {
  const t0 = Date.now();
  const progresso: TecdocImportProgresso = {
    montadoras: 0,
    modelos: 0,
    versoes: 0,
    produtos: 0,
    aplicacoes: 0,
    duracaoMs: 0,
  };

  // 1) Montadoras
  const tecdocToMontadora = new Map<string, string>();
  if (arquivos.manufacturersCsv) {
    const rows = parseCsv(arquivos.manufacturersCsv);
    for (const r of rows) {
      const nome = r.name?.trim();
      if (!nome) continue;
      const m = await prisma.montadora.upsert({
        where: { nome },
        update: { pais: r.country || undefined },
        create: { nome, pais: r.country || undefined },
      });
      tecdocToMontadora.set(r.manufacturer_id, m.id);
      progresso.montadoras++;
    }
  }

  // 2) Modelos
  const tecdocToModelo = new Map<string, string>();
  if (arquivos.modelsCsv) {
    const rows = parseCsv(arquivos.modelsCsv);
    for (const r of rows) {
      const montadoraId = tecdocToMontadora.get(r.manufacturer_id);
      if (!montadoraId || !r.name) continue;
      const m = await prisma.modeloVeiculo.upsert({
        where: { montadoraId_nome: { montadoraId, nome: r.name } },
        update: {
          anoInicio: r.year_from ? Number(r.year_from) : undefined,
          anoFim: r.year_to ? Number(r.year_to) : undefined,
        },
        create: {
          montadoraId,
          nome: r.name,
          anoInicio: r.year_from ? Number(r.year_from) : undefined,
          anoFim: r.year_to ? Number(r.year_to) : undefined,
          categoria: mapearCategoria(r.category),
        },
      });
      tecdocToModelo.set(r.model_id, m.id);
      progresso.modelos++;
    }
  }

  // 3) Versões (types)
  const tecdocToVersao = new Map<string, string>();
  if (arquivos.typesCsv) {
    const rows = parseCsv(arquivos.typesCsv);
    for (const r of rows) {
      const modeloId = tecdocToModelo.get(r.model_id);
      if (!modeloId || !r.description) continue;
      const v = await prisma.versaoVeiculo.create({
        data: {
          modeloId,
          descricao: r.description,
          motor: r.motor || undefined,
          potenciaCv: r.hp ? Number(r.hp) : undefined,
          combustivel: mapearCombustivel(r.fuel),
        },
      }).catch(async () => {
        // versão já existe — tenta encontrar pela descrição
        return prisma.versaoVeiculo.findFirst({
          where: { modeloId, descricao: r.description },
        });
      });
      if (v) {
        tecdocToVersao.set(r.type_id, v.id);
        progresso.versoes++;
      }
    }
  }

  // 4) Artigos (produtos) — só cria se ainda não existe no SKU da empresa
  const tecdocToProduto = new Map<string, string>();
  if (arquivos.articlesCsv) {
    const rows = parseCsv(arquivos.articlesCsv);
    for (const r of rows) {
      if (!r.name || !r.article_id) continue;
      const sku = `TD-${r.article_id}`;
      const marcaNome = r.brand?.trim();
      let marcaId: string | null = null;
      if (marcaNome) {
        const marca = await prisma.marca.upsert({
          where: { nome: marcaNome },
          update: {},
          create: { nome: marcaNome },
        });
        marcaId = marca.id;
      }
      const p = await prisma.produto.upsert({
        where: { empresaId_sku: { empresaId: arquivos.empresaId, sku } },
        update: {
          codigoBarras: r.gtin || undefined,
          codigoOem: r.oem || undefined,
          codigoFabricante: r.manufacturer_code || undefined,
        },
        create: {
          empresaId: arquivos.empresaId,
          sku,
          nome: r.name,
          codigoBarras: r.gtin || undefined,
          codigoOem: r.oem || undefined,
          codigoFabricante: r.manufacturer_code || undefined,
          marcaId,
        },
      });
      tecdocToProduto.set(r.article_id, p.id);
      progresso.produtos++;
    }
  }

  // 5) Compatibilidades (aplicações veiculares)
  if (arquivos.compatibilitiesCsv) {
    const rows = parseCsv(arquivos.compatibilitiesCsv);
    for (const r of rows) {
      const produtoId = tecdocToProduto.get(r.article_id);
      const versaoId = tecdocToVersao.get(r.type_id);
      if (!produtoId || !versaoId) continue;
      const posicao = mapearPosicao(r.position);
      const existente = await prisma.aplicacaoVeicular.findFirst({
        where: { produtoId, versaoId, posicao: posicao ?? null },
        select: { id: true },
      });
      if (existente) continue;
      await prisma.aplicacaoVeicular.create({
        data: { produtoId, versaoId, posicao },
      });
      progresso.aplicacoes++;
    }
  }

  progresso.duracaoMs = Date.now() - t0;
  return progresso;
}

function mapearCategoria(raw?: string): "CARRO" | "CAMINHONETE" | "SUV" | "MOTO" | "CAMINHAO" | "ONIBUS" | "MAQUINA_AGRICOLA" | "EMBARCACAO" {
  if (!raw) return "CARRO";
  const r = raw.toUpperCase();
  if (r.includes("MOTO")) return "MOTO";
  if (r.includes("PICK") || r.includes("TRUCK")) return "CAMINHONETE";
  if (r.includes("SUV") || r.includes("UTILITARIO")) return "SUV";
  if (r.includes("CAMINH")) return "CAMINHAO";
  if (r.includes("ONIBUS") || r.includes("BUS")) return "ONIBUS";
  if (r.includes("AGRIC") || r.includes("TRATOR")) return "MAQUINA_AGRICOLA";
  if (r.includes("EMBARC") || r.includes("BARCO")) return "EMBARCACAO";
  return "CARRO";
}

function mapearCombustivel(raw?: string): "GASOLINA" | "ETANOL" | "FLEX" | "DIESEL" | "GNV" | "ELETRICO" | "HIBRIDO" | undefined {
  if (!raw) return undefined;
  const r = raw.toUpperCase();
  if (r.includes("FLEX")) return "FLEX";
  if (r.includes("ELETR") || r.includes("EV")) return "ELETRICO";
  if (r.includes("HIBRID") || r.includes("HYBRID")) return "HIBRIDO";
  if (r.includes("DIESEL")) return "DIESEL";
  if (r.includes("ETAN") || r.includes("ALCOOL")) return "ETANOL";
  if (r.includes("GNV") || r.includes("LPG")) return "GNV";
  return "GASOLINA";
}

function mapearPosicao(raw?: string): "DIANTEIRA" | "TRASEIRA" | "LADO_DIREITO" | "LADO_ESQUERDO" | "SUPERIOR" | "INFERIOR" | "CENTRAL" | "DIANTEIRA_DIREITA" | "DIANTEIRA_ESQUERDA" | "TRASEIRA_DIREITA" | "TRASEIRA_ESQUERDA" | undefined {
  if (!raw) return undefined;
  const r = raw.toUpperCase().replace(/\s+/g, "_");
  if (r.includes("FRONT_LEFT") || r === "DIANTEIRA_ESQUERDA") return "DIANTEIRA_ESQUERDA";
  if (r.includes("FRONT_RIGHT") || r === "DIANTEIRA_DIREITA") return "DIANTEIRA_DIREITA";
  if (r.includes("REAR_LEFT") || r === "TRASEIRA_ESQUERDA") return "TRASEIRA_ESQUERDA";
  if (r.includes("REAR_RIGHT") || r === "TRASEIRA_DIREITA") return "TRASEIRA_DIREITA";
  if (r.includes("FRONT") || r.includes("DIANT")) return "DIANTEIRA";
  if (r.includes("REAR") || r.includes("TRAS")) return "TRASEIRA";
  if (r.includes("LEFT") || r.includes("ESQ")) return "LADO_ESQUERDO";
  if (r.includes("RIGHT") || r.includes("DIR")) return "LADO_DIREITO";
  if (r.includes("UPPER") || r.includes("SUPER")) return "SUPERIOR";
  if (r.includes("LOWER") || r.includes("INFER")) return "INFERIOR";
  return undefined;
}
