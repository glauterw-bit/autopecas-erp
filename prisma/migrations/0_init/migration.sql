-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateEnum
CREATE TYPE "PerfilUsuario" AS ENUM ('ADMIN', 'GERENTE', 'VENDEDOR', 'CAIXA', 'ESTOQUISTA', 'FINANCEIRO', 'TECNICO');

-- CreateEnum
CREATE TYPE "RegimeTributario" AS ENUM ('SIMPLES_NACIONAL', 'SIMPLES_EXCESSO_SUBLIMITE', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI');

-- CreateEnum
CREATE TYPE "CategoriaVeiculo" AS ENUM ('CARRO', 'CAMINHONETE', 'SUV', 'MOTO', 'CAMINHAO', 'ONIBUS', 'MAQUINA_AGRICOLA', 'EMBARCACAO');

-- CreateEnum
CREATE TYPE "Combustivel" AS ENUM ('GASOLINA', 'ETANOL', 'FLEX', 'DIESEL', 'GNV', 'ELETRICO', 'HIBRIDO');

-- CreateEnum
CREATE TYPE "SistemaVeicular" AS ENUM ('MOTOR', 'ARREFECIMENTO', 'TRANSMISSAO', 'EMBREAGEM', 'FREIO', 'SUSPENSAO', 'DIRECAO', 'ELETRICA', 'IGNICAO', 'COMBUSTIVEL', 'ESCAPAMENTO', 'AR_CONDICIONADO', 'CARROCERIA', 'INTERIOR', 'RODAS_PNEUS', 'ACESSORIOS', 'LUBRIFICANTES', 'FERRAMENTAS', 'OUTROS');

-- CreateEnum
CREATE TYPE "CurvaABC" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "PosicaoMontagem" AS ENUM ('DIANTEIRA', 'TRASEIRA', 'LADO_DIREITO', 'LADO_ESQUERDO', 'SUPERIOR', 'INFERIOR', 'CENTRAL', 'DIANTEIRA_DIREITA', 'DIANTEIRA_ESQUERDA', 'TRASEIRA_DIREITA', 'TRASEIRA_ESQUERDA');

-- CreateEnum
CREATE TYPE "TipoCrossReference" AS ENUM ('EQUIVALENTE', 'SIMILAR', 'SUBSTITUTO', 'KIT_ALTERNATIVO');

-- CreateEnum
CREATE TYPE "TipoDeposito" AS ENUM ('LOJA', 'CENTRO_DISTRIBUICAO', 'CONSIGNACAO', 'TROCA_GARANTIA', 'AVARIA', 'VIRTUAL_MARKETPLACE');

-- CreateEnum
CREATE TYPE "TipoMovimentoEstoque" AS ENUM ('ENTRADA', 'SAIDA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'TRANSFERENCIA_ENTRADA', 'TRANSFERENCIA_SAIDA', 'RESERVA', 'ESTORNO_RESERVA');

-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('PF', 'PJ', 'ESTRANGEIRO');

-- CreateEnum
CREATE TYPE "SegmentoCliente" AS ENUM ('CONSUMIDOR_FINAL', 'MECANICA', 'REVENDA', 'FROTISTA', 'CONCESSIONARIA', 'SEGURADORA', 'ATACADISTA');

-- CreateEnum
CREATE TYPE "StatusPedidoCompra" AS ENUM ('RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'ENVIADO_FORNECEDOR', 'PARCIALMENTE_RECEBIDO', 'RECEBIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoVenda" AS ENUM ('VENDA', 'ORCAMENTO', 'PRE_VENDA', 'DEVOLUCAO', 'TROCA');

-- CreateEnum
CREATE TYPE "StatusVenda" AS ENUM ('ABERTA', 'AGUARDANDO_PAGAMENTO', 'PAGA', 'FATURADA', 'CANCELADA', 'DEVOLVIDA');

-- CreateEnum
CREATE TYPE "OrigemVenda" AS ENUM ('BALCAO', 'PDV', 'ECOMMERCE', 'WHATSAPP', 'TELEFONE', 'MARKETPLACE_ML', 'MARKETPLACE_SHOPEE', 'MARKETPLACE_AMAZON', 'MARKETPLACE_MAGALU', 'EXTERNO');

-- CreateEnum
CREATE TYPE "FormaPagamento" AS ENUM ('DINHEIRO', 'PIX', 'DEBITO', 'CREDITO', 'CREDIARIO', 'BOLETO', 'CHEQUE', 'VALE_PRESENTE', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "TipoPromocao" AS ENUM ('DESCONTO_PERCENT', 'DESCONTO_VALOR', 'COMPRE_X_LEVE_Y', 'PRECO_FIXO', 'BRINDE');

-- CreateEnum
CREATE TYPE "ModeloNF" AS ENUM ('NFE_55', 'NFCE_65', 'SAT_59', 'NFSE');

-- CreateEnum
CREATE TYPE "StatusNF" AS ENUM ('EMITINDO', 'AUTORIZADA', 'REJEITADA', 'CANCELADA', 'DENEGADA', 'INUTILIZADA');

-- CreateEnum
CREATE TYPE "AmbienteNF" AS ENUM ('HOMOLOGACAO', 'PRODUCAO');

-- CreateEnum
CREATE TYPE "TipoContaBancaria" AS ENUM ('CORRENTE', 'POUPANCA', 'CAIXA_FISICO', 'CARTEIRA_DIGITAL', 'CONTA_PAGAMENTO');

-- CreateEnum
CREATE TYPE "TipoPlanoConta" AS ENUM ('RECEITA', 'DESPESA', 'INVESTIMENTO', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "StatusContaFin" AS ENUM ('ABERTO', 'PARCIALMENTE_PAGO', 'PAGO', 'ATRASADO', 'CANCELADO', 'RENEGOCIADO');

-- CreateEnum
CREATE TYPE "TipoMovimentoCaixa" AS ENUM ('ENTRADA', 'SAIDA', 'SANGRIA', 'SUPRIMENTO', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "Plataforma" AS ENUM ('MERCADO_LIVRE', 'SHOPEE', 'AMAZON', 'MAGALU', 'AMERICANAS', 'WEBMOTORS_PECAS', 'OLX', 'ECOMMERCE_PROPRIO', 'WHATSAPP_CATALOG', 'GOOGLE_SHOPPING');

-- CreateEnum
CREATE TYPE "StatusAnuncio" AS ENUM ('ATIVO', 'PAUSADO', 'ENCERRADO', 'REJEITADO', 'EM_REVISAO', 'RASCUNHO');

-- CreateEnum
CREATE TYPE "StatusPedidoMarketplace" AS ENUM ('NOVO', 'IMPORTADO', 'SEPARANDO', 'EXPEDIDO', 'ENTREGUE', 'CANCELADO', 'DEVOLVIDO');

-- CreateEnum
CREATE TYPE "StatusMensagem" AS ENUM ('NAO_LIDA', 'LIDA', 'AGUARDANDO_RESPOSTA', 'RESPONDIDA', 'FECHADA');

-- CreateEnum
CREATE TYPE "TipoInsight" AS ENUM ('RUPTURA_PREDITIVA', 'EXCESSO_ESTOQUE', 'MARGEM_BAIXA', 'OPORTUNIDADE_PRECO', 'ABANDONO_CLIENTE', 'CROSS_SELL', 'FRAUDE_POTENCIAL', 'TENDENCIA_DEMANDA', 'COMPRA_SUGERIDA', 'ANUNCIO_FRACO', 'CADASTRO_DUPLICADO', 'PRODUTO_OBSOLETO');

-- CreateEnum
CREATE TYPE "Severidade" AS ENUM ('INFO', 'AVISO', 'CRITICO');

-- CreateEnum
CREATE TYPE "FeedbackInsight" AS ENUM ('UTIL', 'NAO_UTIL', 'INCORRETO');

-- CreateEnum
CREATE TYPE "CanalConversa" AS ENUM ('CHAT_INTERNO', 'WHATSAPP', 'MERCADO_LIVRE', 'SHOPEE', 'ECOMMERCE', 'TELEFONE_VOZ');

-- CreateEnum
CREATE TYPE "PapelMensagem" AS ENUM ('SISTEMA', 'USUARIO', 'ASSISTENTE', 'FERRAMENTA');

-- CreateEnum
CREATE TYPE "MotivoDevolucao" AS ENUM ('DEFEITO_FABRICACAO', 'PECA_ERRADA', 'PECA_INCOMPATIVEL', 'AVARIA_TRANSPORTE', 'ARREPENDIMENTO', 'EXCESSO_PEDIDO', 'PRAZO_VALIDADE', 'OUTROS');

-- CreateEnum
CREATE TYPE "StatusRMA" AS ENUM ('AGUARDANDO_AUTORIZACAO', 'AUTORIZADA', 'AGUARDANDO_RECEBIMENTO', 'RECEBIDA', 'EM_ANALISE', 'APROVADA', 'RECUSADA', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "ResolucaoRMA" AS ENUM ('REEMBOLSO', 'TROCA_MESMO_PRODUTO', 'TROCA_OUTRO_PRODUTO', 'CREDITO_LOJA', 'REPARO', 'GARANTIA_FORNECEDOR', 'RECUSADA');

-- CreateEnum
CREATE TYPE "TipoCalculoComissao" AS ENUM ('PERCENTUAL_VENDA', 'PERCENTUAL_MARGEM', 'ESCALONADA', 'FIXA_POR_PEDIDO');

-- CreateEnum
CREATE TYPE "PushPlataforma" AS ENUM ('WEB', 'IOS_APNS', 'ANDROID_FCM');

-- CreateEnum
CREATE TYPE "StatusOS" AS ENUM ('ABERTA', 'EM_ANALISE', 'AGUARDANDO_APROVACAO', 'APROVADA', 'EM_EXECUCAO', 'AGUARDANDO_PECA', 'CONCLUIDA', 'ENTREGUE', 'CANCELADA', 'GARANTIA');

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT NOT NULL,
    "inscEstadual" TEXT,
    "inscMunicipal" TEXT,
    "regimeTributario" "RegimeTributario" NOT NULL DEFAULT 'SIMPLES_NACIONAL',
    "cnaeFiscal" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "municipio" TEXT,
    "uf" TEXT,
    "cep" TEXT,
    "logoUrl" TEXT,
    "configuracoes" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filiais" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "endereco" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "filiais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "perfil" "PerfilUsuario" NOT NULL DEFAULT 'VENDEDOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoLogin" TIMESTAMP(3),
    "totpSecret" TEXT,
    "permissoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "montadoras" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "pais" TEXT,
    "logoUrl" TEXT,

    CONSTRAINT "montadoras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelos_veiculo" (
    "id" TEXT NOT NULL,
    "montadoraId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" "CategoriaVeiculo" NOT NULL DEFAULT 'CARRO',
    "anoInicio" INTEGER,
    "anoFim" INTEGER,
    "carroceria" TEXT,

    CONSTRAINT "modelos_veiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versoes_veiculo" (
    "id" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "motor" TEXT,
    "potenciaCv" INTEGER,
    "combustivel" "Combustivel",
    "cambio" TEXT,
    "tracao" TEXT,
    "anoInicio" INTEGER,
    "anoFim" INTEGER,
    "chassiPrefix" TEXT,
    "codigoFipe" TEXT,

    CONSTRAINT "versoes_veiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_peca" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sistema" "SistemaVeicular" NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "categorias_peca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marcas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "pais" TEXT,
    "oem" BOOLEAN NOT NULL DEFAULT false,
    "premium" BOOLEAN NOT NULL DEFAULT false,
    "logoUrl" TEXT,

    CONSTRAINT "marcas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "codigoBarras" TEXT,
    "codigoFabricante" TEXT,
    "codigoOem" TEXT,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "marcaId" TEXT,
    "categoriaId" TEXT,
    "unidade" TEXT NOT NULL DEFAULT 'UN',
    "pesoKg" DECIMAL(10,3),
    "volumeM3" DECIMAL(10,4),
    "larguraCm" DECIMAL(10,2),
    "alturaCm" DECIMAL(10,2),
    "comprimentoCm" DECIMAL(10,2),
    "custoMedio" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "custoUltimaCompra" DECIMAL(14,4),
    "margemAlvo" DECIMAL(6,4),
    "precoVenda" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "precoAtacado" DECIMAL(14,4),
    "precoPromocional" DECIMAL(14,4),
    "precoMinimo" DECIMAL(14,4),
    "estoqueMinimo" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "estoqueMaximo" DECIMAL(14,3),
    "pontoReposicao" DECIMAL(14,3),
    "leadTimeDias" INTEGER NOT NULL DEFAULT 7,
    "curva" "CurvaABC" NOT NULL DEFAULT 'C',
    "ncm" TEXT,
    "cest" TEXT,
    "cfopVendaInterna" TEXT DEFAULT '5102',
    "cfopVendaInterestadual" TEXT DEFAULT '6102',
    "origemFiscal" INTEGER NOT NULL DEFAULT 0,
    "cstIcms" TEXT,
    "aliquotaIcms" DECIMAL(6,4),
    "aliquotaIpi" DECIMAL(6,4),
    "cstPis" TEXT,
    "cstCofins" TEXT,
    "pisAliquota" DECIMAL(6,4),
    "cofinsAliquota" DECIMAL(6,4),
    "localizacao" TEXT,
    "garantiaMeses" INTEGER,
    "fotoPrincipal" TEXT,
    "fotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fichaTecnicaUrl" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "permiteVendaSemEstoque" BOOLEAN NOT NULL DEFAULT false,
    "controlaSerial" BOOLEAN NOT NULL DEFAULT false,
    "controlaLote" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aplicacoes_veiculares" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "posicao" "PosicaoMontagem",
    "quantidadePorVeiculo" INTEGER NOT NULL DEFAULT 1,
    "observacao" TEXT,

    CONSTRAINT "aplicacoes_veiculares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cross_references" (
    "id" TEXT NOT NULL,
    "origemId" TEXT NOT NULL,
    "destinoId" TEXT NOT NULL,
    "tipo" "TipoCrossReference" NOT NULL,
    "confianca" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "fonte" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cross_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depositos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "filialId" TEXT,
    "nome" TEXT NOT NULL,
    "tipo" "TipoDeposito" NOT NULL DEFAULT 'LOJA',
    "endereco" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "permiteVenda" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "depositos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estoque_deposito" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "depositoId" TEXT NOT NULL,
    "quantidade" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reservado" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estoque_deposito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentos_estoque" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "depositoId" TEXT NOT NULL,
    "tipo" "TipoMovimentoEstoque" NOT NULL,
    "quantidade" DECIMAL(14,3) NOT NULL,
    "custoUnitario" DECIMAL(14,4),
    "documento" TEXT,
    "origemTipo" TEXT,
    "origemId" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentos_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservas_estoque" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "depositoId" TEXT NOT NULL,
    "quantidade" DECIMAL(14,3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3),
    "liberada" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservas_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" "TipoPessoa" NOT NULL DEFAULT 'PF',
    "cpfCnpj" TEXT,
    "rgIe" TEXT,
    "nome" TEXT NOT NULL,
    "apelido" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "telefoneAlternativo" TEXT,
    "whatsapp" TEXT,
    "dataNascimento" TIMESTAMP(3),
    "sexo" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "municipio" TEXT,
    "uf" TEXT,
    "cep" TEXT,
    "segmento" "SegmentoCliente" NOT NULL DEFAULT 'CONSUMIDOR_FINAL',
    "limiteCredito" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "saldoDevedor" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bloqueado" BOOLEAN NOT NULL DEFAULT false,
    "observacoes" TEXT,
    "tabelaPrecoId" TEXT,
    "scoreCredito" DOUBLE PRECISION,
    "scoreChurn" DOUBLE PRECISION,
    "ticketMedio" DECIMAL(14,2),
    "ultimaCompra" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "veiculos_cliente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "placa" TEXT,
    "chassi" TEXT,
    "renavam" TEXT,
    "versaoId" TEXT,
    "ano" INTEGER,
    "anoModelo" INTEGER,
    "cor" TEXT,
    "kmAtual" INTEGER,
    "kmUltimoServico" INTEGER,
    "observacoes" TEXT,

    CONSTRAINT "veiculos_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fornecedores" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" "TipoPessoa" NOT NULL DEFAULT 'PJ',
    "cnpjCpf" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "inscricaoEstadual" TEXT,
    "contatoNome" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "endereco" TEXT,
    "prazoEntregaDias" INTEGER,
    "condicaoPagamentoPadrao" TEXT,
    "bancoFavorecido" TEXT,
    "pixChave" TEXT,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "pontualidade" DOUBLE PRECISION,
    "qualidadeMedia" DOUBLE PRECISION,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_compra" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "status" "StatusPedidoCompra" NOT NULL DEFAULT 'RASCUNHO',
    "dataEmissao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataPrevisaoEntrega" TIMESTAMP(3),
    "valorBruto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorFrete" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorDesconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "geradoPorIA" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedidos_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_pedido_compra" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" DECIMAL(14,3) NOT NULL,
    "custoUnitario" DECIMAL(14,4) NOT NULL,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "itens_pedido_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_entrada" (
    "id" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "pedidoCompraId" TEXT,
    "chaveAcesso" TEXT,
    "numero" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "dataEntrada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valorProdutos" DECIMAL(14,2) NOT NULL,
    "valorFrete" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorDesconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorIpi" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorIcmsSt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorTotal" DECIMAL(14,2) NOT NULL,
    "xmlOriginal" TEXT,
    "ocrConfianca" DOUBLE PRECISION,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notas_entrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_nota_entrada" (
    "id" TEXT NOT NULL,
    "notaId" TEXT NOT NULL,
    "produtoId" TEXT,
    "descricaoOriginal" TEXT NOT NULL,
    "codigoFornecedor" TEXT,
    "quantidade" DECIMAL(14,3) NOT NULL,
    "unidade" TEXT NOT NULL,
    "valorUnitario" DECIMAL(14,4) NOT NULL,
    "valorTotal" DECIMAL(14,2) NOT NULL,
    "cfop" TEXT,
    "ncm" TEXT,
    "precoVendaSugerido" DECIMAL(14,4),
    "margemSugerida" DECIMAL(6,4),

    CONSTRAINT "itens_nota_entrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caixas" (
    "id" TEXT NOT NULL,
    "filialId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "caixas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes_caixa" (
    "id" TEXT NOT NULL,
    "caixaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "abertaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadaEm" TIMESTAMP(3),
    "valorAbertura" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorFechamento" DECIMAL(14,2),
    "divergencia" DECIMAL(14,2),

    CONSTRAINT "sessoes_caixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "filialId" TEXT,
    "sessaoCaixaId" TEXT,
    "numero" INTEGER NOT NULL,
    "tipo" "TipoVenda" NOT NULL DEFAULT 'VENDA',
    "status" "StatusVenda" NOT NULL DEFAULT 'ABERTA',
    "origem" "OrigemVenda" NOT NULL DEFAULT 'BALCAO',
    "marketplaceConta" TEXT,
    "clienteId" TEXT,
    "vendedorId" TEXT,
    "veiculoPlaca" TEXT,
    "veiculoDescricao" TEXT,
    "valorBruto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorDesconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "descontoPercent" DECIMAL(6,4),
    "valorAcrescimo" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorFrete" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "custoTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "margemBruta" DECIMAL(14,2),
    "margemPercent" DECIMAL(6,4),
    "observacoes" TEXT,
    "notaFiscalId" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadaEm" TIMESTAMP(3),
    "canceladaEm" TIMESTAMP(3),
    "motivoCancelamento" TEXT,

    CONSTRAINT "vendas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_venda" (
    "id" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" DECIMAL(14,3) NOT NULL,
    "precoUnitario" DECIMAL(14,4) NOT NULL,
    "custoUnitario" DECIMAL(14,4) NOT NULL,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "acrescimo" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "margem" DECIMAL(14,2),
    "observacao" TEXT,
    "margemAbaixoMinimo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "itens_venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagamentos_venda" (
    "id" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "formaPagamento" "FormaPagamento" NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "parcelas" INTEGER NOT NULL DEFAULT 1,
    "bandeira" TEXT,
    "nsuAutorizacao" TEXT,
    "taxaPercent" DECIMAL(6,4),
    "taxaValor" DECIMAL(14,2),
    "contaBancariaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagamentos_venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tabelas_preco" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "descontoPercent" DECIMAL(6,4),
    "acrescimoPercent" DECIMAL(6,4),

    CONSTRAINT "tabelas_preco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lista_preco_itens" (
    "id" TEXT NOT NULL,
    "tabelaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "preco" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "lista_preco_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "precos_por_veiculo" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "preco" DECIMAL(14,4) NOT NULL,
    "precoKit" DECIMAL(14,4),

    CONSTRAINT "precos_por_veiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promocoes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoPromocao" NOT NULL,
    "valorRegra" DECIMAL(14,4),
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "promocoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_promocao" (
    "id" TEXT NOT NULL,
    "promocaoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,

    CONSTRAINT "itens_promocao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_fiscais" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "modelo" "ModeloNF" NOT NULL,
    "serie" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "chaveAcesso" TEXT,
    "protocolo" TEXT,
    "status" "StatusNF" NOT NULL DEFAULT 'EMITINDO',
    "ambiente" "AmbienteNF" NOT NULL DEFAULT 'PRODUCAO',
    "clienteId" TEXT,
    "naturezaOperacao" TEXT NOT NULL,
    "dataEmissao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAutorizacao" TIMESTAMP(3),
    "dataCancelamento" TIMESTAMP(3),
    "motivoCancelamento" TEXT,
    "valorProdutos" DECIMAL(14,2) NOT NULL,
    "valorFrete" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorDesconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorIcms" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorIcmsSt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorIpi" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorPis" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorCofins" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorTotal" DECIMAL(14,2) NOT NULL,
    "xmlAutorizado" TEXT,
    "xmlCancelamento" TEXT,
    "danfeUrl" TEXT,
    "cce" JSONB,

    CONSTRAINT "notas_fiscais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contas_bancarias" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "banco" TEXT,
    "agencia" TEXT,
    "conta" TEXT,
    "tipo" "TipoContaBancaria" NOT NULL DEFAULT 'CORRENTE',
    "saldoAtual" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "contas_bancarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plano_contas" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoPlanoConta" NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "plano_contas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contas_receber" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT,
    "vendaId" TEXT,
    "planoContaId" TEXT,
    "contaBancariaId" TEXT,
    "descricao" TEXT NOT NULL,
    "formaPagamento" "FormaPagamento" NOT NULL,
    "parcela" INTEGER NOT NULL DEFAULT 1,
    "totalParcelas" INTEGER NOT NULL DEFAULT 1,
    "documento" TEXT,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "dataRecebimento" TIMESTAMP(3),
    "valor" DECIMAL(14,2) NOT NULL,
    "valorRecebido" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "juros" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "multa" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "StatusContaFin" NOT NULL DEFAULT 'ABERTO',
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contas_receber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contas_pagar" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "planoContaId" TEXT,
    "contaBancariaId" TEXT,
    "descricao" TEXT NOT NULL,
    "documento" TEXT,
    "parcela" INTEGER NOT NULL DEFAULT 1,
    "totalParcelas" INTEGER NOT NULL DEFAULT 1,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "dataPagamento" TIMESTAMP(3),
    "valor" DECIMAL(14,2) NOT NULL,
    "valorPago" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "juros" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "multa" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "StatusContaFin" NOT NULL DEFAULT 'ABERTO',
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contas_pagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentos_caixa" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "sessaoCaixaId" TEXT,
    "contaBancariaId" TEXT,
    "planoContaId" TEXT,
    "usuarioId" TEXT,
    "tipo" "TipoMovimentoCaixa" NOT NULL,
    "formaPagamento" "FormaPagamento",
    "valor" DECIMAL(14,2) NOT NULL,
    "descricao" TEXT NOT NULL,
    "documento" TEXT,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentos_caixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_contas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "plataforma" "Plataforma" NOT NULL,
    "nomeReferencia" TEXT NOT NULL,
    "contaExternaId" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiraEm" TIMESTAMP(3),
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "configuracoes" JSONB,
    "ultimoSync" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_contas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_anuncios" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "itemIdExterno" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "preco" DECIMAL(14,2) NOT NULL,
    "precoOriginal" DECIMAL(14,2),
    "estoqueExposto" INTEGER NOT NULL DEFAULT 0,
    "status" "StatusAnuncio" NOT NULL DEFAULT 'ATIVO',
    "url" TEXT,
    "tipoListagem" TEXT,
    "fee" DECIMAL(14,2),
    "frete" JSONB,
    "compatibilidadesUniversal" BOOLEAN NOT NULL DEFAULT false,
    "compatibilidadesCatalog" JSONB,
    "ultimaSincronizacao" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_anuncios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_pedidos" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "pedidoIdExterno" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "statusInterno" "StatusPedidoMarketplace" NOT NULL DEFAULT 'NOVO',
    "valorTotal" DECIMAL(14,2) NOT NULL,
    "valorFrete" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "feeMarketplace" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dataPedido" TIMESTAMP(3) NOT NULL,
    "payloadOriginal" JSONB NOT NULL,
    "vendaId" TEXT,
    "observacao" TEXT,

    CONSTRAINT "marketplace_pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens_marketplace" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "conversaIdExterno" TEXT NOT NULL,
    "remetente" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "recebidaEm" TIMESTAMP(3) NOT NULL,
    "respondidaEm" TIMESTAMP(3),
    "respondidaPorIA" BOOLEAN NOT NULL DEFAULT false,
    "rascunhoIA" TEXT,
    "status" "StatusMensagem" NOT NULL DEFAULT 'NAO_LIDA',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "mensagens_marketplace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insights_ia" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" "TipoInsight" NOT NULL,
    "severidade" "Severidade" NOT NULL DEFAULT 'INFO',
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "acaoSugerida" TEXT,
    "dadosReferencia" JSONB,
    "resolvidoEm" TIMESTAMP(3),
    "resolvidoPor" TEXT,
    "feedback" "FeedbackInsight",
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insights_ia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversas_ia" (
    "id" TEXT NOT NULL,
    "canal" "CanalConversa" NOT NULL,
    "clienteId" TEXT,
    "identificadorExterno" TEXT,
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadaEm" TIMESTAMP(3),
    "resumo" TEXT,
    "transferidaParaHumano" BOOLEAN NOT NULL DEFAULT false,
    "satisfacao" INTEGER,

    CONSTRAINT "conversas_ia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens_ia" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "papel" "PapelMensagem" NOT NULL,
    "conteudo" TEXT NOT NULL,
    "ferramenta" TEXT,
    "argsFerramenta" JSONB,
    "custoTokens" INTEGER,
    "modelo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_ia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitacoes_rma" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numeroRMA" INTEGER NOT NULL,
    "vendaId" TEXT,
    "itemVendaId" TEXT,
    "produtoId" TEXT NOT NULL,
    "clienteId" TEXT,
    "motivo" "MotivoDevolucao" NOT NULL,
    "descricao" TEXT,
    "fotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "quantidade" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "status" "StatusRMA" NOT NULL DEFAULT 'AGUARDANDO_AUTORIZACAO',
    "resolucao" "ResolucaoRMA",
    "valorReembolso" DECIMAL(14,2),
    "novoItemVendaId" TEXT,
    "contaReceberId" TEXT,
    "trocaGarantiaFornecedorId" TEXT,
    "abertaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autorizadaEm" TIMESTAMP(3),
    "recebidaEm" TIMESTAMP(3),
    "resolvidaEm" TIMESTAMP(3),
    "observacoes" TEXT,
    "inspecionadoPor" TEXT,

    CONSTRAINT "solicitacoes_rma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garantias_item" (
    "id" TEXT NOT NULL,
    "itemVendaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "clienteId" TEXT,
    "inicioGarantia" TIMESTAMP(3) NOT NULL,
    "fimGarantia" TIMESTAMP(3) NOT NULL,
    "meses" INTEGER NOT NULL,
    "acionada" BOOLEAN NOT NULL DEFAULT false,
    "rmaId" TEXT,

    CONSTRAINT "garantias_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regras_comissao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "tipoCalculo" "TipoCalculoComissao" NOT NULL DEFAULT 'PERCENTUAL_VENDA',
    "percentualBase" DECIMAL(6,4),
    "bonificacaoMeta" DECIMAL(14,2),
    "metaMensal" DECIMAL(14,2),
    "overridesCategoria" JSONB,
    "overridesMarca" JSONB,
    "abaterMargemBaixa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regras_comissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apuracoes_comissao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "regraId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "totalVendido" DECIMAL(14,2) NOT NULL,
    "totalMargem" DECIMAL(14,2) NOT NULL,
    "valorComissao" DECIMAL(14,2) NOT NULL,
    "bonificacao" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "meta" DECIMAL(14,2),
    "atingimento" DECIMAL(6,4),
    "detalhe" JSONB,
    "pago" BOOLEAN NOT NULL DEFAULT false,
    "pagoEm" TIMESTAMP(3),
    "contaPagarId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apuracoes_comissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes_auth" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessoes_auth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "clienteId" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "authKey" TEXT NOT NULL,
    "userAgent" TEXT,
    "plataforma" "PushPlataforma" NOT NULL DEFAULT 'WEB',
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordens_servico" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "status" "StatusOS" NOT NULL DEFAULT 'ABERTA',
    "clienteId" TEXT,
    "veiculoClienteId" TEXT,
    "placa" TEXT,
    "kmEntrada" INTEGER,
    "kmSaida" INTEGER,
    "abertaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prevConclusao" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "entreguaEm" TIMESTAMP(3),
    "diagnostico" TEXT,
    "servicoExecutado" TEXT,
    "observacoes" TEXT,
    "tecnicoId" TEXT,
    "vendaPecasId" TEXT,
    "notaServicoId" TEXT,
    "valorPecas" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorServicos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorDesconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "garantiaServicoDias" INTEGER NOT NULL DEFAULT 90,
    "fotosAntes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fotosDepois" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "ordens_servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_servico_os" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "codigoServico" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "valorUnitario" DECIMAL(14,2) NOT NULL,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "duracaoMinutos" INTEGER,

    CONSTRAINT "itens_servico_os_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs_auditoria" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "dadosAntes" JSONB,
    "dadosDepois" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_cnpj_key" ON "empresas"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "montadoras_nome_key" ON "montadoras"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "modelos_veiculo_montadoraId_nome_key" ON "modelos_veiculo"("montadoraId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_peca_nome_key" ON "categorias_peca"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "marcas_nome_key" ON "marcas"("nome");

-- CreateIndex
CREATE INDEX "produtos_empresaId_codigoBarras_idx" ON "produtos"("empresaId", "codigoBarras");

-- CreateIndex
CREATE INDEX "produtos_empresaId_codigoFabricante_idx" ON "produtos"("empresaId", "codigoFabricante");

-- CreateIndex
CREATE INDEX "produtos_empresaId_codigoOem_idx" ON "produtos"("empresaId", "codigoOem");

-- CreateIndex
CREATE INDEX "produtos_empresaId_ativo_idx" ON "produtos"("empresaId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_empresaId_sku_key" ON "produtos"("empresaId", "sku");

-- CreateIndex
CREATE INDEX "aplicacoes_veiculares_versaoId_idx" ON "aplicacoes_veiculares"("versaoId");

-- CreateIndex
CREATE UNIQUE INDEX "aplicacoes_veiculares_produtoId_versaoId_posicao_key" ON "aplicacoes_veiculares"("produtoId", "versaoId", "posicao");

-- CreateIndex
CREATE INDEX "cross_references_destinoId_idx" ON "cross_references"("destinoId");

-- CreateIndex
CREATE UNIQUE INDEX "cross_references_origemId_destinoId_key" ON "cross_references"("origemId", "destinoId");

-- CreateIndex
CREATE INDEX "estoque_deposito_depositoId_idx" ON "estoque_deposito"("depositoId");

-- CreateIndex
CREATE UNIQUE INDEX "estoque_deposito_produtoId_depositoId_key" ON "estoque_deposito"("produtoId", "depositoId");

-- CreateIndex
CREATE INDEX "movimentos_estoque_produtoId_idx" ON "movimentos_estoque"("produtoId");

-- CreateIndex
CREATE INDEX "movimentos_estoque_depositoId_idx" ON "movimentos_estoque"("depositoId");

-- CreateIndex
CREATE INDEX "movimentos_estoque_origemTipo_origemId_idx" ON "movimentos_estoque"("origemTipo", "origemId");

-- CreateIndex
CREATE INDEX "clientes_empresaId_nome_idx" ON "clientes"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_empresaId_cpfCnpj_key" ON "clientes"("empresaId", "cpfCnpj");

-- CreateIndex
CREATE INDEX "veiculos_cliente_placa_idx" ON "veiculos_cliente"("placa");

-- CreateIndex
CREATE INDEX "veiculos_cliente_chassi_idx" ON "veiculos_cliente"("chassi");

-- CreateIndex
CREATE UNIQUE INDEX "fornecedores_empresaId_cnpjCpf_key" ON "fornecedores"("empresaId", "cnpjCpf");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_compra_empresaId_numero_key" ON "pedidos_compra"("empresaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "notas_entrada_pedidoCompraId_key" ON "notas_entrada"("pedidoCompraId");

-- CreateIndex
CREATE UNIQUE INDEX "notas_entrada_chaveAcesso_key" ON "notas_entrada"("chaveAcesso");

-- CreateIndex
CREATE UNIQUE INDEX "vendas_notaFiscalId_key" ON "vendas"("notaFiscalId");

-- CreateIndex
CREATE INDEX "vendas_empresaId_status_idx" ON "vendas"("empresaId", "status");

-- CreateIndex
CREATE INDEX "vendas_empresaId_criadaEm_idx" ON "vendas"("empresaId", "criadaEm");

-- CreateIndex
CREATE UNIQUE INDEX "vendas_empresaId_numero_key" ON "vendas"("empresaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "lista_preco_itens_tabelaId_produtoId_key" ON "lista_preco_itens"("tabelaId", "produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "precos_por_veiculo_produtoId_versaoId_key" ON "precos_por_veiculo"("produtoId", "versaoId");

-- CreateIndex
CREATE UNIQUE INDEX "itens_promocao_promocaoId_produtoId_key" ON "itens_promocao"("promocaoId", "produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "notas_fiscais_chaveAcesso_key" ON "notas_fiscais"("chaveAcesso");

-- CreateIndex
CREATE UNIQUE INDEX "notas_fiscais_empresaId_modelo_serie_numero_key" ON "notas_fiscais"("empresaId", "modelo", "serie", "numero");

-- CreateIndex
CREATE INDEX "contas_receber_empresaId_status_dataVencimento_idx" ON "contas_receber"("empresaId", "status", "dataVencimento");

-- CreateIndex
CREATE INDEX "contas_pagar_empresaId_status_dataVencimento_idx" ON "contas_pagar"("empresaId", "status", "dataVencimento");

-- CreateIndex
CREATE INDEX "movimentos_caixa_empresaId_data_idx" ON "movimentos_caixa"("empresaId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_contas_empresaId_plataforma_nomeReferencia_key" ON "marketplace_contas"("empresaId", "plataforma", "nomeReferencia");

-- CreateIndex
CREATE INDEX "marketplace_anuncios_produtoId_idx" ON "marketplace_anuncios"("produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_anuncios_contaId_itemIdExterno_key" ON "marketplace_anuncios"("contaId", "itemIdExterno");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_pedidos_contaId_pedidoIdExterno_key" ON "marketplace_pedidos"("contaId", "pedidoIdExterno");

-- CreateIndex
CREATE INDEX "mensagens_marketplace_contaId_status_idx" ON "mensagens_marketplace"("contaId", "status");

-- CreateIndex
CREATE INDEX "insights_ia_empresaId_tipo_resolvidoEm_idx" ON "insights_ia"("empresaId", "tipo", "resolvidoEm");

-- CreateIndex
CREATE INDEX "solicitacoes_rma_empresaId_status_idx" ON "solicitacoes_rma"("empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "solicitacoes_rma_empresaId_numeroRMA_key" ON "solicitacoes_rma"("empresaId", "numeroRMA");

-- CreateIndex
CREATE UNIQUE INDEX "garantias_item_itemVendaId_key" ON "garantias_item"("itemVendaId");

-- CreateIndex
CREATE INDEX "garantias_item_clienteId_fimGarantia_idx" ON "garantias_item"("clienteId", "fimGarantia");

-- CreateIndex
CREATE UNIQUE INDEX "apuracoes_comissao_empresaId_vendedorId_competencia_key" ON "apuracoes_comissao"("empresaId", "vendedorId", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_auth_token_key" ON "sessoes_auth"("token");

-- CreateIndex
CREATE INDEX "sessoes_auth_usuarioId_expiraEm_idx" ON "sessoes_auth"("usuarioId", "expiraEm");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_usuarioId_idx" ON "push_subscriptions"("usuarioId");

-- CreateIndex
CREATE INDEX "push_subscriptions_clienteId_idx" ON "push_subscriptions"("clienteId");

-- CreateIndex
CREATE INDEX "ordens_servico_empresaId_status_idx" ON "ordens_servico"("empresaId", "status");

-- CreateIndex
CREATE INDEX "ordens_servico_placa_idx" ON "ordens_servico"("placa");

-- CreateIndex
CREATE UNIQUE INDEX "ordens_servico_empresaId_numero_key" ON "ordens_servico"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "logs_auditoria_entidade_entidadeId_idx" ON "logs_auditoria"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "logs_auditoria_usuarioId_criadoEm_idx" ON "logs_auditoria"("usuarioId", "criadoEm");

-- AddForeignKey
ALTER TABLE "filiais" ADD CONSTRAINT "filiais_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modelos_veiculo" ADD CONSTRAINT "modelos_veiculo_montadoraId_fkey" FOREIGN KEY ("montadoraId") REFERENCES "montadoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versoes_veiculo" ADD CONSTRAINT "versoes_veiculo_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "modelos_veiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias_peca" ADD CONSTRAINT "categorias_peca_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categorias_peca"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_marcaId_fkey" FOREIGN KEY ("marcaId") REFERENCES "marcas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias_peca"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicacoes_veiculares" ADD CONSTRAINT "aplicacoes_veiculares_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicacoes_veiculares" ADD CONSTRAINT "aplicacoes_veiculares_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "versoes_veiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cross_references" ADD CONSTRAINT "cross_references_origemId_fkey" FOREIGN KEY ("origemId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cross_references" ADD CONSTRAINT "cross_references_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depositos" ADD CONSTRAINT "depositos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depositos" ADD CONSTRAINT "depositos_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque_deposito" ADD CONSTRAINT "estoque_deposito_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque_deposito" ADD CONSTRAINT "estoque_deposito_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "depositos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "depositos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas_estoque" ADD CONSTRAINT "reservas_estoque_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas_estoque" ADD CONSTRAINT "reservas_estoque_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "depositos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tabelaPrecoId_fkey" FOREIGN KEY ("tabelaPrecoId") REFERENCES "tabelas_preco"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "veiculos_cliente" ADD CONSTRAINT "veiculos_cliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "veiculos_cliente" ADD CONSTRAINT "veiculos_cliente_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "versoes_veiculo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_compra" ADD CONSTRAINT "pedidos_compra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_compra" ADD CONSTRAINT "pedidos_compra_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_pedido_compra" ADD CONSTRAINT "itens_pedido_compra_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_pedido_compra" ADD CONSTRAINT "itens_pedido_compra_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_entrada" ADD CONSTRAINT "notas_entrada_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_entrada" ADD CONSTRAINT "notas_entrada_pedidoCompraId_fkey" FOREIGN KEY ("pedidoCompraId") REFERENCES "pedidos_compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_nota_entrada" ADD CONSTRAINT "itens_nota_entrada_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "notas_entrada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_nota_entrada" ADD CONSTRAINT "itens_nota_entrada_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caixas" ADD CONSTRAINT "caixas_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes_caixa" ADD CONSTRAINT "sessoes_caixa_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES "caixas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes_caixa" ADD CONSTRAINT "sessoes_caixa_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_sessaoCaixaId_fkey" FOREIGN KEY ("sessaoCaixaId") REFERENCES "sessoes_caixa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_notaFiscalId_fkey" FOREIGN KEY ("notaFiscalId") REFERENCES "notas_fiscais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_venda" ADD CONSTRAINT "itens_venda_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_venda" ADD CONSTRAINT "itens_venda_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos_venda" ADD CONSTRAINT "pagamentos_venda_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos_venda" ADD CONSTRAINT "pagamentos_venda_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_preco_itens" ADD CONSTRAINT "lista_preco_itens_tabelaId_fkey" FOREIGN KEY ("tabelaId") REFERENCES "tabelas_preco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_preco_itens" ADD CONSTRAINT "lista_preco_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precos_por_veiculo" ADD CONSTRAINT "precos_por_veiculo_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_promocao" ADD CONSTRAINT "itens_promocao_promocaoId_fkey" FOREIGN KEY ("promocaoId") REFERENCES "promocoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_promocao" ADD CONSTRAINT "itens_promocao_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_bancarias" ADD CONSTRAINT "contas_bancarias_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plano_contas" ADD CONSTRAINT "plano_contas_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "plano_contas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_planoContaId_fkey" FOREIGN KEY ("planoContaId") REFERENCES "plano_contas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_pagar" ADD CONSTRAINT "contas_pagar_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_pagar" ADD CONSTRAINT "contas_pagar_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_pagar" ADD CONSTRAINT "contas_pagar_planoContaId_fkey" FOREIGN KEY ("planoContaId") REFERENCES "plano_contas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_pagar" ADD CONSTRAINT "contas_pagar_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_caixa" ADD CONSTRAINT "movimentos_caixa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_caixa" ADD CONSTRAINT "movimentos_caixa_sessaoCaixaId_fkey" FOREIGN KEY ("sessaoCaixaId") REFERENCES "sessoes_caixa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_caixa" ADD CONSTRAINT "movimentos_caixa_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_caixa" ADD CONSTRAINT "movimentos_caixa_planoContaId_fkey" FOREIGN KEY ("planoContaId") REFERENCES "plano_contas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_caixa" ADD CONSTRAINT "movimentos_caixa_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_contas" ADD CONSTRAINT "marketplace_contas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_anuncios" ADD CONSTRAINT "marketplace_anuncios_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "marketplace_contas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_anuncios" ADD CONSTRAINT "marketplace_anuncios_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_pedidos" ADD CONSTRAINT "marketplace_pedidos_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "marketplace_contas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_marketplace" ADD CONSTRAINT "mensagens_marketplace_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "marketplace_contas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights_ia" ADD CONSTRAINT "insights_ia_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas_ia" ADD CONSTRAINT "conversas_ia_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_ia" ADD CONSTRAINT "mensagens_ia_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "conversas_ia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apuracoes_comissao" ADD CONSTRAINT "apuracoes_comissao_regraId_fkey" FOREIGN KEY ("regraId") REFERENCES "regras_comissao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_servico_os" ADD CONSTRAINT "itens_servico_os_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "ordens_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs_auditoria" ADD CONSTRAINT "logs_auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

