-- CreateEnum
CREATE TYPE "MotivoVendaPerdida" AS ENUM ('SEM_ESTOQUE', 'PRECO', 'PRAZO_ENTREGA', 'NAO_TRABALHAMOS', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusInventario" AS ENUM ('EM_CONTAGEM', 'CONFERENCIA', 'AJUSTADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "NaturezaPartida" AS ENUM ('DEBITO', 'CREDITO');

-- AlterEnum
ALTER TYPE "TipoVenda" ADD VALUE 'CONDICIONAL';

-- AlterTable
ALTER TABLE "vendas" ADD COLUMN     "condicionalRetornoEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "produto_fornecedores" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "codigoNoFornecedor" TEXT,
    "precoCompra" DECIMAL(14,4) NOT NULL,
    "prazoEntregaDias" INTEGER NOT NULL DEFAULT 7,
    "qtdMinima" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "preferencial" BOOLEAN NOT NULL DEFAULT false,
    "ultimaCompraEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produto_fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendas_perdidas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "produtoId" TEXT,
    "descricaoBuscada" TEXT NOT NULL,
    "quantidade" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "motivo" "MotivoVendaPerdida" NOT NULL DEFAULT 'SEM_ESTOQUE',
    "clienteId" TEXT,
    "vendedorId" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendas_perdidas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventarios" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "depositoId" TEXT NOT NULL,
    "status" "StatusInventario" NOT NULL DEFAULT 'EM_CONTAGEM',
    "responsavelId" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEm" TIMESTAMP(3),

    CONSTRAINT "inventarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_inventario" (
    "id" TEXT NOT NULL,
    "inventarioId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "qtdSistema" DECIMAL(14,3) NOT NULL,
    "qtdContada" DECIMAL(14,3),

    CONSTRAINT "itens_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lancamentos_contabeis" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "historico" TEXT NOT NULL,
    "origemTipo" TEXT,
    "origemId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lancamentos_contabeis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partidas_contabeis" (
    "id" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "planoContaId" TEXT NOT NULL,
    "natureza" "NaturezaPartida" NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "partidas_contabeis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "produto_fornecedores_fornecedorId_idx" ON "produto_fornecedores"("fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "produto_fornecedores_produtoId_fornecedorId_key" ON "produto_fornecedores"("produtoId", "fornecedorId");

-- CreateIndex
CREATE INDEX "vendas_perdidas_empresaId_criadoEm_idx" ON "vendas_perdidas"("empresaId", "criadoEm");

-- CreateIndex
CREATE INDEX "vendas_perdidas_empresaId_produtoId_idx" ON "vendas_perdidas"("empresaId", "produtoId");

-- CreateIndex
CREATE INDEX "inventarios_empresaId_status_idx" ON "inventarios"("empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "itens_inventario_inventarioId_produtoId_key" ON "itens_inventario"("inventarioId", "produtoId");

-- CreateIndex
CREATE INDEX "lancamentos_contabeis_empresaId_data_idx" ON "lancamentos_contabeis"("empresaId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "lancamentos_contabeis_empresaId_origemTipo_origemId_key" ON "lancamentos_contabeis"("empresaId", "origemTipo", "origemId");

-- CreateIndex
CREATE INDEX "partidas_contabeis_planoContaId_idx" ON "partidas_contabeis"("planoContaId");

-- AddForeignKey
ALTER TABLE "produto_fornecedores" ADD CONSTRAINT "produto_fornecedores_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_fornecedores" ADD CONSTRAINT "produto_fornecedores_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas_perdidas" ADD CONSTRAINT "vendas_perdidas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas_perdidas" ADD CONSTRAINT "vendas_perdidas_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "depositos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_inventario" ADD CONSTRAINT "itens_inventario_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "inventarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_inventario" ADD CONSTRAINT "itens_inventario_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_contabeis" ADD CONSTRAINT "lancamentos_contabeis_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidas_contabeis" ADD CONSTRAINT "partidas_contabeis_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "lancamentos_contabeis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidas_contabeis" ADD CONSTRAINT "partidas_contabeis_planoContaId_fkey" FOREIGN KEY ("planoContaId") REFERENCES "plano_contas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

