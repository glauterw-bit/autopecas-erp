// Plano de contas padrão brasileiro
// =================================
// Estrutura aderente à ITG 1000 / Receita Federal / SPED ECD.
// Hierarquia: Grupo → Subgrupo → Conta sintética → Conta analítica.

export type GrupoContabil =
  | "ATIVO_CIRCULANTE"
  | "ATIVO_NAO_CIRCULANTE"
  | "PASSIVO_CIRCULANTE"
  | "PASSIVO_NAO_CIRCULANTE"
  | "PATRIMONIO_LIQUIDO"
  | "RECEITA"
  | "DEDUCAO_RECEITA"
  | "CUSTO"
  | "DESPESA_OPERACIONAL"
  | "DESPESA_FINANCEIRA"
  | "RECEITA_FINANCEIRA"
  | "OUTRA_RECEITA"
  | "OUTRA_DESPESA"
  | "IMPOSTO_RENDA";

export interface ContaPadrao {
  codigo: string;        // ex.: "1.1.01.001"
  nome: string;
  grupo: GrupoContabil;
  natureza: "DEVEDORA" | "CREDORA";
  sintetica: boolean;    // true = nó pai, false = folha onde lança movimento
}

// Plano padrão para varejo de auto peças (Simples / Presumido).
export const PLANO_PADRAO_AUTOPECAS: ContaPadrao[] = [
  // 1 - ATIVO
  { codigo: "1", nome: "ATIVO", grupo: "ATIVO_CIRCULANTE", natureza: "DEVEDORA", sintetica: true },
  { codigo: "1.1", nome: "Ativo Circulante", grupo: "ATIVO_CIRCULANTE", natureza: "DEVEDORA", sintetica: true },
  { codigo: "1.1.01", nome: "Disponibilidades", grupo: "ATIVO_CIRCULANTE", natureza: "DEVEDORA", sintetica: true },
  { codigo: "1.1.01.001", nome: "Caixa", grupo: "ATIVO_CIRCULANTE", natureza: "DEVEDORA", sintetica: false },
  { codigo: "1.1.01.002", nome: "Bancos Conta Movimento", grupo: "ATIVO_CIRCULANTE", natureza: "DEVEDORA", sintetica: false },
  { codigo: "1.1.01.003", nome: "Bancos Conta Aplicação", grupo: "ATIVO_CIRCULANTE", natureza: "DEVEDORA", sintetica: false },
  { codigo: "1.1.01.004", nome: "Carteira PIX", grupo: "ATIVO_CIRCULANTE", natureza: "DEVEDORA", sintetica: false },
  { codigo: "1.1.02", nome: "Direitos Realizáveis", grupo: "ATIVO_CIRCULANTE", natureza: "DEVEDORA", sintetica: true },
  { codigo: "1.1.02.001", nome: "Clientes - Vendas a Prazo", grupo: "ATIVO_CIRCULANTE", natureza: "DEVEDORA", sintetica: false },
  { codigo: "1.1.02.002", nome: "Cheques a Receber", grupo: "ATIVO_CIRCULANTE", natureza: "DEVEDORA", sintetica: false },
  { codigo: "1.1.02.003", nome: "Cartões a Receber", grupo: "ATIVO_CIRCULANTE", natureza: "DEVEDORA", sintetica: false },
  { codigo: "1.1.03", nome: "Estoques", grupo: "ATIVO_CIRCULANTE", natureza: "DEVEDORA", sintetica: true },
  { codigo: "1.1.03.001", nome: "Estoque de Mercadorias", grupo: "ATIVO_CIRCULANTE", natureza: "DEVEDORA", sintetica: false },
  { codigo: "1.1.04", nome: "Impostos a Recuperar", grupo: "ATIVO_CIRCULANTE", natureza: "DEVEDORA", sintetica: true },
  { codigo: "1.1.04.001", nome: "ICMS a Recuperar", grupo: "ATIVO_CIRCULANTE", natureza: "DEVEDORA", sintetica: false },
  { codigo: "1.1.04.002", nome: "PIS/COFINS a Recuperar", grupo: "ATIVO_CIRCULANTE", natureza: "DEVEDORA", sintetica: false },
  { codigo: "1.2", nome: "Ativo Não Circulante", grupo: "ATIVO_NAO_CIRCULANTE", natureza: "DEVEDORA", sintetica: true },
  { codigo: "1.2.01", nome: "Imobilizado", grupo: "ATIVO_NAO_CIRCULANTE", natureza: "DEVEDORA", sintetica: true },
  { codigo: "1.2.01.001", nome: "Móveis e Utensílios", grupo: "ATIVO_NAO_CIRCULANTE", natureza: "DEVEDORA", sintetica: false },
  { codigo: "1.2.01.002", nome: "Equipamentos de Informática", grupo: "ATIVO_NAO_CIRCULANTE", natureza: "DEVEDORA", sintetica: false },

  // 2 - PASSIVO
  { codigo: "2", nome: "PASSIVO", grupo: "PASSIVO_CIRCULANTE", natureza: "CREDORA", sintetica: true },
  { codigo: "2.1", nome: "Passivo Circulante", grupo: "PASSIVO_CIRCULANTE", natureza: "CREDORA", sintetica: true },
  { codigo: "2.1.01", nome: "Fornecedores", grupo: "PASSIVO_CIRCULANTE", natureza: "CREDORA", sintetica: false },
  { codigo: "2.1.02", nome: "Obrigações Trabalhistas", grupo: "PASSIVO_CIRCULANTE", natureza: "CREDORA", sintetica: true },
  { codigo: "2.1.02.001", nome: "Salários a Pagar", grupo: "PASSIVO_CIRCULANTE", natureza: "CREDORA", sintetica: false },
  { codigo: "2.1.02.002", nome: "INSS a Recolher", grupo: "PASSIVO_CIRCULANTE", natureza: "CREDORA", sintetica: false },
  { codigo: "2.1.02.003", nome: "FGTS a Recolher", grupo: "PASSIVO_CIRCULANTE", natureza: "CREDORA", sintetica: false },
  { codigo: "2.1.03", nome: "Obrigações Tributárias", grupo: "PASSIVO_CIRCULANTE", natureza: "CREDORA", sintetica: true },
  { codigo: "2.1.03.001", nome: "ICMS a Recolher", grupo: "PASSIVO_CIRCULANTE", natureza: "CREDORA", sintetica: false },
  { codigo: "2.1.03.002", nome: "PIS a Recolher", grupo: "PASSIVO_CIRCULANTE", natureza: "CREDORA", sintetica: false },
  { codigo: "2.1.03.003", nome: "COFINS a Recolher", grupo: "PASSIVO_CIRCULANTE", natureza: "CREDORA", sintetica: false },
  { codigo: "2.1.03.004", nome: "Simples Nacional a Recolher (DAS)", grupo: "PASSIVO_CIRCULANTE", natureza: "CREDORA", sintetica: false },
  { codigo: "2.1.03.005", nome: "IRPJ a Recolher", grupo: "PASSIVO_CIRCULANTE", natureza: "CREDORA", sintetica: false },
  { codigo: "2.1.03.006", nome: "CSLL a Recolher", grupo: "PASSIVO_CIRCULANTE", natureza: "CREDORA", sintetica: false },
  { codigo: "2.1.04", nome: "Empréstimos e Financiamentos", grupo: "PASSIVO_CIRCULANTE", natureza: "CREDORA", sintetica: false },

  // 2.3 - PATRIMÔNIO LÍQUIDO
  { codigo: "2.3", nome: "Patrimônio Líquido", grupo: "PATRIMONIO_LIQUIDO", natureza: "CREDORA", sintetica: true },
  { codigo: "2.3.01", nome: "Capital Social", grupo: "PATRIMONIO_LIQUIDO", natureza: "CREDORA", sintetica: false },
  { codigo: "2.3.02", nome: "Reservas de Lucros", grupo: "PATRIMONIO_LIQUIDO", natureza: "CREDORA", sintetica: false },
  { codigo: "2.3.03", nome: "Lucros Acumulados", grupo: "PATRIMONIO_LIQUIDO", natureza: "CREDORA", sintetica: false },

  // 3 - RECEITAS
  { codigo: "3", nome: "RECEITAS", grupo: "RECEITA", natureza: "CREDORA", sintetica: true },
  { codigo: "3.1", nome: "Receita Operacional Bruta", grupo: "RECEITA", natureza: "CREDORA", sintetica: true },
  { codigo: "3.1.01", nome: "Vendas de Mercadorias", grupo: "RECEITA", natureza: "CREDORA", sintetica: false },
  { codigo: "3.1.02", nome: "Vendas via Marketplace", grupo: "RECEITA", natureza: "CREDORA", sintetica: false },
  { codigo: "3.1.03", nome: "Prestação de Serviços (Instalação)", grupo: "RECEITA", natureza: "CREDORA", sintetica: false },
  { codigo: "3.2", nome: "Deduções de Receita", grupo: "DEDUCAO_RECEITA", natureza: "DEVEDORA", sintetica: true },
  { codigo: "3.2.01", nome: "Devoluções de Vendas", grupo: "DEDUCAO_RECEITA", natureza: "DEVEDORA", sintetica: false },
  { codigo: "3.2.02", nome: "Impostos sobre Vendas", grupo: "DEDUCAO_RECEITA", natureza: "DEVEDORA", sintetica: false },
  { codigo: "3.2.03", nome: "Comissões Marketplace", grupo: "DEDUCAO_RECEITA", natureza: "DEVEDORA", sintetica: false },

  // 4 - CUSTOS
  { codigo: "4", nome: "CUSTOS", grupo: "CUSTO", natureza: "DEVEDORA", sintetica: true },
  { codigo: "4.1", nome: "Custo das Mercadorias Vendidas (CMV)", grupo: "CUSTO", natureza: "DEVEDORA", sintetica: false },

  // 5 - DESPESAS OPERACIONAIS
  { codigo: "5", nome: "DESPESAS OPERACIONAIS", grupo: "DESPESA_OPERACIONAL", natureza: "DEVEDORA", sintetica: true },
  { codigo: "5.1", nome: "Despesas com Pessoal", grupo: "DESPESA_OPERACIONAL", natureza: "DEVEDORA", sintetica: true },
  { codigo: "5.1.01", nome: "Salários e Ordenados", grupo: "DESPESA_OPERACIONAL", natureza: "DEVEDORA", sintetica: false },
  { codigo: "5.1.02", nome: "Encargos Sociais", grupo: "DESPESA_OPERACIONAL", natureza: "DEVEDORA", sintetica: false },
  { codigo: "5.1.03", nome: "Vale Transporte / Refeição", grupo: "DESPESA_OPERACIONAL", natureza: "DEVEDORA", sintetica: false },
  { codigo: "5.2", nome: "Despesas Administrativas", grupo: "DESPESA_OPERACIONAL", natureza: "DEVEDORA", sintetica: true },
  { codigo: "5.2.01", nome: "Aluguel", grupo: "DESPESA_OPERACIONAL", natureza: "DEVEDORA", sintetica: false },
  { codigo: "5.2.02", nome: "Energia Elétrica", grupo: "DESPESA_OPERACIONAL", natureza: "DEVEDORA", sintetica: false },
  { codigo: "5.2.03", nome: "Telefone / Internet", grupo: "DESPESA_OPERACIONAL", natureza: "DEVEDORA", sintetica: false },
  { codigo: "5.2.04", nome: "Material de Escritório", grupo: "DESPESA_OPERACIONAL", natureza: "DEVEDORA", sintetica: false },
  { codigo: "5.2.05", nome: "Honorários Contábeis", grupo: "DESPESA_OPERACIONAL", natureza: "DEVEDORA", sintetica: false },
  { codigo: "5.3", nome: "Despesas Comerciais", grupo: "DESPESA_OPERACIONAL", natureza: "DEVEDORA", sintetica: true },
  { codigo: "5.3.01", nome: "Frete sobre Vendas", grupo: "DESPESA_OPERACIONAL", natureza: "DEVEDORA", sintetica: false },
  { codigo: "5.3.02", nome: "Comissões de Vendedores", grupo: "DESPESA_OPERACIONAL", natureza: "DEVEDORA", sintetica: false },
  { codigo: "5.3.03", nome: "Marketing e Publicidade", grupo: "DESPESA_OPERACIONAL", natureza: "DEVEDORA", sintetica: false },
  { codigo: "5.3.04", nome: "Taxas Mercado Pago / Adquirentes", grupo: "DESPESA_OPERACIONAL", natureza: "DEVEDORA", sintetica: false },

  // 6 - DESPESAS / RECEITAS FINANCEIRAS
  { codigo: "6", nome: "RESULTADO FINANCEIRO", grupo: "DESPESA_FINANCEIRA", natureza: "DEVEDORA", sintetica: true },
  { codigo: "6.1", nome: "Despesas Financeiras", grupo: "DESPESA_FINANCEIRA", natureza: "DEVEDORA", sintetica: true },
  { codigo: "6.1.01", nome: "Juros Bancários", grupo: "DESPESA_FINANCEIRA", natureza: "DEVEDORA", sintetica: false },
  { codigo: "6.1.02", nome: "Tarifas Bancárias", grupo: "DESPESA_FINANCEIRA", natureza: "DEVEDORA", sintetica: false },
  { codigo: "6.1.03", nome: "IOF", grupo: "DESPESA_FINANCEIRA", natureza: "DEVEDORA", sintetica: false },
  { codigo: "6.2", nome: "Receitas Financeiras", grupo: "RECEITA_FINANCEIRA", natureza: "CREDORA", sintetica: true },
  { codigo: "6.2.01", nome: "Rendimentos de Aplicações", grupo: "RECEITA_FINANCEIRA", natureza: "CREDORA", sintetica: false },
  { codigo: "6.2.02", nome: "Juros Recebidos / Multas", grupo: "RECEITA_FINANCEIRA", natureza: "CREDORA", sintetica: false },

  // 7 - IRPJ / CSLL
  { codigo: "7", nome: "IRPJ E CSLL", grupo: "IMPOSTO_RENDA", natureza: "DEVEDORA", sintetica: true },
  { codigo: "7.1", nome: "Provisão IRPJ", grupo: "IMPOSTO_RENDA", natureza: "DEVEDORA", sintetica: false },
  { codigo: "7.2", nome: "Provisão CSLL", grupo: "IMPOSTO_RENDA", natureza: "DEVEDORA", sintetica: false },
];
