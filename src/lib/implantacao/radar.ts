// Adaptador "Radar espelho"
// =========================
// Lê o espelho do ERP antigo que o Radar Autopeças mantém no Postgres dele
// (erp_produtos, erp_precos, erp_estoque, erp_clientes, erp_fornecedores) e
// devolve linhas no mesmo formato do CSV, para passar pelo mesmo importador.
//
// SOMENTE LEITURA, sempre:
// - cada página é uma transação READ ONLY (o Postgres recusa qualquer escrita);
// - statement_timeout curto por consulta;
// - paginação por chave (WHERE cd > último ORDER BY cd LIMIT n), sem OFFSET;
// - nada de agregação pesada no banco de produção do Radar.
//
// Atenção ao preço: o espelho guarda em preco_venda o PREÇO MÍNIMO do ERP antigo
// (o procedimento 13 devolve VL_PRECO_MINIMO_VENDA nesse campo — ver
// radar-autopecas/docs/erp-capacidades.md). Por isso:
//   precoMinimo = preco_venda do espelho
//   precoVenda  = último preço de tabela faturado nos últimos 120 dias (erp_vendas),
//                 e, sem venda recente, o próprio mínimo (contado no relatório para revisão).
import { PrismaClient } from "@prisma/client";
import type { RegistroBruto } from "./tipos";
import { type Dec } from "./normalizar";

export type OpcoesRadar = {
  url: string;
  pagina?: number; // linhas por página (padrão 1000)
  timeoutMs?: number; // statement_timeout por consulta (padrão 15 s)
  filialPreco?: number; // filial de preço; padrão = a filial que o espelho já usa em erp_produtos
  almoxarifados?: number[]; // filtra almoxarifados; padrão = todos
  diasPrecoTabela?: number; // janela para buscar preço de tabela faturado (padrão 120)
  limite?: number; // teto de linhas por tabela (teste)
};

export type DadosRadar = {
  produtos: RegistroBruto[];
  estoque: RegistroBruto[];
  clientes: RegistroBruto[];
  fornecedores: RegistroBruto[];
  info: {
    tabelas: Record<string, boolean>;
    precoTabelaDoHistorico: number;
    precoTabelaIgualMinimo: number;
    consultas: number;
  };
};

type Linha = Record<string, unknown>;

// Número do espelho → texto com vírgula decimal (sem ambiguidade para o validador).
function num(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = typeof v === "object" && v !== null && "toFixed" in v ? (v as Dec).toString() : String(v);
  if (s.trim() === "") return undefined;
  return s.replace(".", ",");
}
function txt(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

export class LeitorRadar {
  private db: PrismaClient;
  consultas = 0;
  constructor(private o: OpcoesRadar) {
    this.db = new PrismaClient({ datasources: { db: { url: o.url } }, log: ["error"] });
  }

  async fechar() {
    await this.db.$disconnect();
  }

  // Uma consulta = uma transação curta e somente leitura.
  async consultar<T = Linha>(sql: string, ...params: unknown[]): Promise<T[]> {
    this.consultas++;
    const timeout = Math.max(1000, Math.min(this.o.timeoutMs ?? 15_000, 60_000));
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${timeout}`);
        await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = 2000`);
        return tx.$queryRawUnsafe<T[]>(sql, ...params);
      },
      { timeout: timeout + 5000, maxWait: 10_000 },
    );
  }

  async tabelaExiste(nome: string): Promise<boolean> {
    const r = await this.consultar<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, `public.${nome}`);
    return !!r[0]?.ok;
  }

  // Pagina por chave texto.
  async *paginas(sqlBase: (depoisDe: string) => [string, unknown[]]): AsyncGenerator<Linha[]> {
    let ultimo = "";
    let total = 0;
    const limite = this.o.limite ?? Infinity;
    for (;;) {
      const [sql, params] = sqlBase(ultimo);
      const rows = await this.consultar(sql, ...params);
      if (!rows.length) return;
      const corte = rows.slice(0, Math.max(0, limite - total));
      total += corte.length;
      yield corte;
      if (corte.length < rows.length || total >= limite || rows.length < this.tamanho) return;
      ultimo = String(rows[rows.length - 1].k);
    }
  }

  get tamanho() {
    return Math.max(50, Math.min(this.o.pagina ?? 1000, 5000));
  }
}

export async function lerRadar(o: OpcoesRadar): Promise<DadosRadar> {
  const leitor = new LeitorRadar(o);
  const n = leitor.tamanho;
  const out: DadosRadar = {
    produtos: [],
    estoque: [],
    clientes: [],
    fornecedores: [],
    info: { tabelas: {}, precoTabelaDoHistorico: 0, precoTabelaIgualMinimo: 0, consultas: 0 },
  };
  try {
    for (const t of ["erp_produtos", "erp_precos", "erp_estoque", "erp_vendas", "erp_clientes", "erp_fornecedores"])
      out.info.tabelas[t] = await leitor.tabelaExiste(t);
    if (!out.info.tabelas.erp_produtos) throw new Error("Origem sem a tabela erp_produtos: não é um espelho do Radar");

    // --- Produtos (+ preço da filial escolhida + unidade do estoque) ---------
    const filial = o.filialPreco ?? null;
    const dias = o.diasPrecoTabela ?? 120;
    let seq = 0;
    for await (const pg of leitor.paginas((depois) => [
      `SELECT p.cd_produto AS k, p.descricao, p.texto, p.fabricante, p.marca, p.status, p.peso,
              ${filial !== null && out.info.tabelas.erp_precos ? "pr.preco_venda, pr.preco_custo" : "p.preco_venda, p.preco_custo"},
              ${out.info.tabelas.erp_estoque ? "(SELECT e.unidade FROM erp_estoque e WHERE e.cd_produto = p.cd_produto AND e.unidade IS NOT NULL LIMIT 1)" : "NULL"} AS unidade,
              COALESCE($3::int, p.filial_preco) AS filial
         FROM erp_produtos p
         ${filial !== null && out.info.tabelas.erp_precos ? "LEFT JOIN erp_precos pr ON pr.cd_produto = p.cd_produto AND pr.cd_filial = $3::int" : ""}
        WHERE p.cd_produto > $1
        ORDER BY p.cd_produto
        LIMIT $2`,
      [depois, n, filial],
    ])) {
      // preço de tabela faturado mais recente, só para os produtos desta página
      const tabela = new Map<string, unknown>();
      if (out.info.tabelas.erp_vendas) {
        const rows = await leitor.consultar<{ cd_produto: string; vl_unit_tabela: unknown }>(
          `SELECT DISTINCT ON (cd_produto) cd_produto, vl_unit_tabela
             FROM erp_vendas
            WHERE cd_produto = ANY($1::text[])
              AND situacao ILIKE 'FATURADO%'
              AND faturamento >= now() - ($2::int * interval '1 day')
              AND vl_unit_tabela > 0
              AND ($3::int IS NULL OR filial = $3::int)
            ORDER BY cd_produto, faturamento DESC`,
          pg.map((r) => String(r.k)),
          dias,
          filial ?? (pg[0]?.filial as number | null) ?? null,
        );
        for (const r of rows) tabela.set(r.cd_produto, r.vl_unit_tabela);
      }
      for (const r of pg) {
        const cd = String(r.k).trim();
        const minimo = r.preco_venda;
        const tab = tabela.get(String(r.k));
        if (tab !== undefined) out.info.precoTabelaDoHistorico++;
        else if (minimo !== null && minimo !== undefined) out.info.precoTabelaIgualMinimo++;
        out.produtos.push({
          linha: ++seq,
          ref: `erp_produtos ${cd}`,
          valores: {
            codigo: cd,
            descricao: txt(r.descricao),
            descricaoComplementar: txt(r.texto),
            codigoFabricante: txt(r.fabricante), // no espelho "fabricante" é o código do fabricante
            marca: txt(r.marca),
            ativo: txt(r.status),
            pesoKg: num(r.peso),
            precoMinimo: num(minimo),
            precoVenda: num(tab ?? minimo),
            custo: num(r.preco_custo),
            unidade: txt(r.unidade),
          },
        });
      }
    }

    // --- Estoque por almoxarifado -------------------------------------------
    if (out.info.tabelas.erp_estoque) {
      const almox = o.almoxarifados?.length ? o.almoxarifados : null;
      seq = 0;
      for await (const pg of leitor.paginas((depois) => [
        `SELECT e.cd_produto || '@' || lpad(e.cd_almoxarifado::text, 6, '0') AS k, e.cd_produto, e.cd_almoxarifado, e.qt,
                p.preco_custo
           FROM erp_estoque e
           LEFT JOIN erp_produtos p ON p.cd_produto = e.cd_produto
          WHERE e.cd_produto || '@' || lpad(e.cd_almoxarifado::text, 6, '0') > $1
            AND ($3::int[] IS NULL OR e.cd_almoxarifado = ANY($3::int[]))
          ORDER BY 1
          LIMIT $2`,
        [depois, n, almox],
      ])) {
        for (const r of pg) {
          const cd = String(r.cd_produto).trim();
          out.estoque.push({
            linha: ++seq,
            ref: `erp_estoque ${cd} almox ${r.cd_almoxarifado}`,
            valores: {
              codigo: cd,
              deposito: `Almoxarifado ${r.cd_almoxarifado}`,
              quantidade: num(r.qt) ?? "0",
              custo: num(r.preco_custo),
            },
          });
        }
      }
    }

    // --- Clientes -----------------------------------------------------------
    if (out.info.tabelas.erp_clientes) {
      seq = 0;
      for await (const pg of leitor.paginas((depois) => [
        `SELECT cd_cliente AS k, nome, cpf_cnpj, fones FROM erp_clientes WHERE cd_cliente > $1 ORDER BY cd_cliente LIMIT $2`,
        [depois, n],
      ])) {
        for (const r of pg) {
          const fones = Array.isArray(r.fones) ? (r.fones as string[]) : [];
          const celular = fones.find((f) => /^\d{2}9\d{8}$/.test(f.replace(/\D/g, "").replace(/^55(?=\d{11}$)/, "")));
          const fixo = fones.find((f) => f !== celular);
          out.clientes.push({
            linha: ++seq,
            ref: `erp_clientes ${String(r.k).trim()}`,
            valores: {
              codigo: String(r.k).trim(),
              nome: txt(r.nome),
              cpfCnpj: txt(r.cpf_cnpj),
              whatsapp: celular,
              telefone: fixo ?? celular,
            },
          });
        }
      }
    }

    // --- Fornecedores -------------------------------------------------------
    if (out.info.tabelas.erp_fornecedores) {
      seq = 0;
      for await (const pg of leitor.paginas((depois) => [
        `SELECT cd_fornecedor AS k, razao, fantasia, cpf_cnpj, cidade, status FROM erp_fornecedores WHERE cd_fornecedor > $1 ORDER BY cd_fornecedor LIMIT $2`,
        [depois, n],
      ])) {
        for (const r of pg) {
          out.fornecedores.push({
            linha: ++seq,
            ref: `erp_fornecedores ${String(r.k).trim()}`,
            valores: {
              codigo: String(r.k).trim(),
              razaoSocial: txt(r.razao),
              nomeFantasia: txt(r.fantasia),
              cnpjCpf: txt(r.cpf_cnpj),
              municipio: txt(r.cidade),
              ativo: txt(r.status),
            },
          });
        }
      }
    }
  } finally {
    out.info.consultas = leitor.consultas;
    await leitor.fechar();
  }
  return out;
}
