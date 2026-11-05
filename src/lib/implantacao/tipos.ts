// Implantação: tipos e definição dos campos de cada cadastro importável
// ======================================================================
// O importador recebe linhas "brutas" (texto), seja de CSV/planilha, seja do
// espelho do Radar. Cada entidade declara seus campos, quais são obrigatórios
// e os apelidos de coluna que reconhecemos para sugerir o mapa sozinho.

export const ENTIDADES = [
  "PRODUTO",
  "ESTOQUE",
  "PRECO",
  "CLIENTE",
  "FORNECEDOR",
  "CONTA_RECEBER",
] as const;
export type Entidade = (typeof ENTIDADES)[number];

export type CampoDef = {
  campo: string;
  rotulo: string;
  obrigatorio?: boolean;
  apelidos: string[]; // nomes de coluna comuns (comparados sem acento/caixa/pontuação)
  ajuda?: string;
};

// Linha antes de validar: campo → texto. `linha` é a linha do arquivo (1 = cabeçalho,
// então a primeira linha de dados é 2). `ref` identifica a origem quando não é CSV.
export type RegistroBruto = {
  linha: number;
  ref?: string;
  valores: Record<string, string | undefined>;
};

export type Mapa = Record<string, string | null>; // campo → nome da coluna no arquivo

export const ROTULO_ENTIDADE: Record<Entidade, string> = {
  PRODUTO: "Produtos",
  ESTOQUE: "Estoque por depósito",
  PRECO: "Preços",
  CLIENTE: "Clientes",
  FORNECEDOR: "Fornecedores",
  CONTA_RECEBER: "Contas a receber em aberto",
};

// Ordem certa de importar (cada uma depende das anteriores).
export const ORDEM_IMPORTACAO: Entidade[] = [
  "FORNECEDOR",
  "PRODUTO",
  "PRECO",
  "ESTOQUE",
  "CLIENTE",
  "CONTA_RECEBER",
];

export const CAMPOS: Record<Entidade, CampoDef[]> = {
  PRODUTO: [
    { campo: "codigo", rotulo: "Código interno", obrigatorio: true, apelidos: ["codigo", "cod", "cd_produto", "sku", "codigo interno", "cod produto", "referencia interna", "id produto"] },
    { campo: "descricao", rotulo: "Descrição", obrigatorio: true, apelidos: ["descricao", "nome", "ds_produto", "produto", "descricao produto", "nome produto"] },
    { campo: "descricaoComplementar", rotulo: "Descrição complementar", apelidos: ["texto", "ds_texto_explicativo", "complemento", "observacao", "descricao complementar", "detalhe"] },
    { campo: "codigoFabricante", rotulo: "Código do fabricante", apelidos: ["codigo fabricante", "cd_fabricante", "fabricante", "cod fabricante", "referencia", "ref fabricante", "part number"] },
    { campo: "codigoOem", rotulo: "Código original (OEM)", apelidos: ["oem", "codigo oem", "codigo original", "original", "cod original", "numero original"] },
    { campo: "ean", rotulo: "EAN / código de barras", apelidos: ["ean", "gtin", "codigo barras", "cod barras", "codigo de barras", "ean13"] },
    { campo: "ncm", rotulo: "NCM", apelidos: ["ncm", "cd_ncm", "classificacao fiscal"] },
    { campo: "cest", rotulo: "CEST", apelidos: ["cest"] },
    { campo: "marca", rotulo: "Marca", apelidos: ["marca", "ds_marca", "fabricante nome", "marca produto"] },
    { campo: "unidade", rotulo: "Unidade", apelidos: ["unidade", "un", "und", "unid", "unidade medida"] },
    { campo: "precoVenda", rotulo: "Preço de venda (tabela)", apelidos: ["preco venda", "preco", "vl_preco_venda", "valor venda", "preco tabela", "pv"] },
    { campo: "precoMinimo", rotulo: "Preço mínimo", apelidos: ["preco minimo", "vl_preco_minimo_venda", "minimo"] },
    { campo: "custo", rotulo: "Custo", apelidos: ["custo", "preco custo", "vl_preco_custo", "custo medio", "valor custo"] },
    { campo: "aplicacao", rotulo: "Aplicação (texto)", apelidos: ["aplicacao", "aplicacoes", "veiculo", "veiculos", "aplicacao veicular"], ajuda: "Guardada como texto na descrição. A aplicação estruturada (montadora/modelo/ano) é feita depois." },
    { campo: "ativo", rotulo: "Ativo (S/N)", apelidos: ["ativo", "status", "cd_status", "situacao"] },
    { campo: "pesoKg", rotulo: "Peso (kg)", apelidos: ["peso", "peso kg", "qt_peso_kg"] },
    { campo: "localizacao", rotulo: "Localização", apelidos: ["localizacao", "prateleira", "endereco estoque", "local"] },
    { campo: "estoqueMinimo", rotulo: "Estoque mínimo", apelidos: ["estoque minimo", "minimo estoque", "est min"] },
  ],
  ESTOQUE: [
    { campo: "codigo", rotulo: "Código interno do produto", obrigatorio: true, apelidos: ["codigo", "cod", "cd_produto", "sku", "codigo produto"] },
    { campo: "deposito", rotulo: "Depósito / almoxarifado", apelidos: ["deposito", "almoxarifado", "cd_almoxarifado", "local estoque", "filial"], ajuda: "Vazio = depósito padrão escolhido na tela." },
    { campo: "quantidade", rotulo: "Quantidade", obrigatorio: true, apelidos: ["quantidade", "qt", "qtd", "saldo", "estoque", "qtde"] },
    { campo: "custo", rotulo: "Custo unitário", apelidos: ["custo", "custo unitario", "preco custo", "custo medio"] },
  ],
  PRECO: [
    { campo: "codigo", rotulo: "Código interno do produto", obrigatorio: true, apelidos: ["codigo", "cod", "cd_produto", "sku"] },
    { campo: "precoVenda", rotulo: "Preço de venda (tabela)", apelidos: ["preco venda", "preco", "valor venda", "preco tabela", "pv"] },
    { campo: "precoMinimo", rotulo: "Preço mínimo", apelidos: ["preco minimo", "minimo"] },
    { campo: "custo", rotulo: "Custo", apelidos: ["custo", "preco custo", "custo medio"] },
  ],
  CLIENTE: [
    { campo: "codigo", rotulo: "Código no sistema antigo", apelidos: ["codigo", "cod", "cd_cliente", "codigo cliente", "id"] },
    { campo: "nome", rotulo: "Nome / razão social", obrigatorio: true, apelidos: ["nome", "razao social", "razao", "cliente", "nome cliente"] },
    { campo: "cpfCnpj", rotulo: "CPF/CNPJ", apelidos: ["cpf cnpj", "cpf", "cnpj", "documento", "cpf_cnpj", "doc"] },
    { campo: "ie", rotulo: "RG / Inscrição estadual", apelidos: ["ie", "inscricao estadual", "rg", "rg ie"] },
    { campo: "apelido", rotulo: "Nome fantasia / apelido", apelidos: ["fantasia", "nome fantasia", "apelido"] },
    { campo: "email", rotulo: "E-mail", apelidos: ["email", "e mail"] },
    { campo: "telefone", rotulo: "Telefone", apelidos: ["telefone", "fone", "tel", "telefone 1"] },
    { campo: "whatsapp", rotulo: "Celular / WhatsApp", apelidos: ["celular", "whatsapp", "whats", "cel"] },
    { campo: "logradouro", rotulo: "Endereço (rua)", apelidos: ["endereco", "logradouro", "rua"] },
    { campo: "numero", rotulo: "Número", apelidos: ["numero", "nro", "num"] },
    { campo: "complemento", rotulo: "Complemento", apelidos: ["complemento"] },
    { campo: "bairro", rotulo: "Bairro", apelidos: ["bairro"] },
    { campo: "municipio", rotulo: "Cidade", apelidos: ["cidade", "municipio"] },
    { campo: "uf", rotulo: "UF", apelidos: ["uf", "estado"] },
    { campo: "cep", rotulo: "CEP", apelidos: ["cep"] },
    { campo: "limiteCredito", rotulo: "Limite de crédito", apelidos: ["limite", "limite credito", "credito"] },
    { campo: "observacoes", rotulo: "Observações", apelidos: ["observacoes", "obs", "observacao"] },
  ],
  FORNECEDOR: [
    { campo: "codigo", rotulo: "Código no sistema antigo", apelidos: ["codigo", "cod", "cd_fornecedor"] },
    { campo: "razaoSocial", rotulo: "Razão social", obrigatorio: true, apelidos: ["razao social", "razao", "nome", "fornecedor"] },
    { campo: "nomeFantasia", rotulo: "Nome fantasia", apelidos: ["fantasia", "nome fantasia"] },
    { campo: "cnpjCpf", rotulo: "CNPJ/CPF", obrigatorio: true, apelidos: ["cnpj", "cpf cnpj", "cnpj cpf", "cpf_cnpj", "documento"] },
    { campo: "ie", rotulo: "Inscrição estadual", apelidos: ["ie", "inscricao estadual"] },
    { campo: "contato", rotulo: "Contato", apelidos: ["contato", "vendedor", "representante"] },
    { campo: "telefone", rotulo: "Telefone", apelidos: ["telefone", "fone", "tel"] },
    { campo: "email", rotulo: "E-mail", apelidos: ["email", "e mail"] },
    { campo: "endereco", rotulo: "Endereço", apelidos: ["endereco", "logradouro"] },
    { campo: "municipio", rotulo: "Cidade", apelidos: ["cidade", "municipio"] },
    { campo: "uf", rotulo: "UF", apelidos: ["uf", "estado"] },
    { campo: "prazoEntregaDias", rotulo: "Prazo de entrega (dias)", apelidos: ["prazo", "prazo entrega", "lead time"] },
    { campo: "ativo", rotulo: "Ativo (S/N)", apelidos: ["ativo", "status", "situacao"] },
  ],
  CONTA_RECEBER: [
    { campo: "codigo", rotulo: "Código do título", apelidos: ["codigo", "titulo", "id titulo", "nr titulo", "cd_titulo"], ajuda: "Se não houver, a chave vira documento + parcela." },
    { campo: "documento", rotulo: "Documento / nota", apelidos: ["documento", "nota", "nf", "pedido", "duplicata"] },
    { campo: "parcela", rotulo: "Parcela", apelidos: ["parcela", "nr parcela"] },
    { campo: "totalParcelas", rotulo: "Total de parcelas", apelidos: ["total parcelas", "qtd parcelas"] },
    { campo: "clienteCodigo", rotulo: "Código do cliente", apelidos: ["codigo cliente", "cd_cliente", "cod cliente"] },
    { campo: "clienteCpfCnpj", rotulo: "CPF/CNPJ do cliente", apelidos: ["cpf cnpj", "cpf", "cnpj", "cpf_cnpj", "documento cliente"] },
    { campo: "vencimento", rotulo: "Vencimento", obrigatorio: true, apelidos: ["vencimento", "data vencimento", "dt vencimento", "vence"] },
    { campo: "valor", rotulo: "Saldo em aberto", obrigatorio: true, apelidos: ["saldo", "valor aberto", "saldo aberto", "valor", "vl saldo"], ajuda: "O que falta receber, não o valor original." },
    { campo: "formaPagamento", rotulo: "Forma (boleto, carteira…)", apelidos: ["forma", "forma pagamento", "tipo", "especie", "forma_pgto"] },
    { campo: "descricao", rotulo: "Descrição", apelidos: ["descricao", "historico"] },
  ],
};

// Nomes legíveis das contagens do relatório de conferência.
export const ROTULO_DETALHE: Record<string, string> = {
  semNcm: "sem NCM (nota bloqueada até corrigir)",
  semEan: "sem EAN",
  semMarca: "sem marca",
  semCodigoFabricante: "sem código do fabricante",
  semPrecoVenda: "sem preço de venda",
  semCusto: "sem custo",
  inativos: "inativos",
  itensComSaldo: "itens com saldo",
  itensZerados: "itens zerados",
  negativosZerados: "negativos na origem (entraram como zero)",
  comPrecoVenda: "com preço de venda",
  comPrecoMinimo: "com preço mínimo",
  comCusto: "com custo",
  pf: "pessoa física",
  pj: "pessoa jurídica",
  semDocumento: "sem CPF/CNPJ",
  semTelefone: "sem telefone",
  titulosVencidos: "títulos vencidos",
  valorVencido: "valor vencido",
  clientesDistintos: "clientes com título",
  precoTabelaDoHistorico: "preço de tabela tirado da última venda faturada",
  precoTabelaIgualMinimo: "sem venda recente: preço de venda = preço mínimo (revisar)",
};
