-- CreateEnum
CREATE TYPE "MotivoRetorno" AS ENUM ('ERRO_CADASTRO', 'ERRO_BALCAO', 'GARANTIA_DEFEITO', 'DESISTENCIA');

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "prazoPagamentoDias" INTEGER,
ADD COLUMN     "ultimoContatoEm" TIMESTAMP(3),
ADD COLUMN     "ultimoContatoNota" TEXT,
ADD COLUMN     "vendedorResponsavelId" TEXT;

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "aplicacaoVerificadaEm" TIMESTAMP(3),
ADD COLUMN     "aplicacaoVerificadaPorId" TEXT,
ADD COLUMN     "aplicacaoVerificadaPorNome" TEXT,
ADD COLUMN     "revisaoCadastro" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "revisaoCadastroEm" TIMESTAMP(3),
ADD COLUMN     "revisaoCadastroMotivo" TEXT;

-- AlterTable
ALTER TABLE "vendas_perdidas" ADD COLUMN     "veiculoDescricao" TEXT;

-- CreateTable
CREATE TABLE "retornos_venda" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "itemVendaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'VENDA',
    "quantidade" DECIMAL(14,3) NOT NULL,
    "motivo" "MotivoRetorno" NOT NULL,
    "voltaEstoque" BOOLEAN NOT NULL DEFAULT true,
    "observacao" TEXT,
    "usuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retornos_venda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "retornos_venda_empresaId_criadoEm_idx" ON "retornos_venda"("empresaId", "criadoEm");

-- CreateIndex
CREATE INDEX "retornos_venda_empresaId_motivo_idx" ON "retornos_venda"("empresaId", "motivo");

-- CreateIndex
CREATE INDEX "retornos_venda_itemVendaId_idx" ON "retornos_venda"("itemVendaId");

-- CreateIndex
CREATE INDEX "produtos_empresaId_revisaoCadastro_idx" ON "produtos"("empresaId", "revisaoCadastro");

-- AddForeignKey
ALTER TABLE "retornos_venda" ADD CONSTRAINT "retornos_venda_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retornos_venda" ADD CONSTRAINT "retornos_venda_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

