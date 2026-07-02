-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "vallenteApiKey" TEXT;

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "b2bAtivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "senhaHashB2B" TEXT;

-- AlterTable
ALTER TABLE "vendas" ADD COLUMN     "externoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "empresas_vallenteApiKey_key" ON "empresas"("vallenteApiKey");

-- CreateIndex
CREATE INDEX "vendas_empresaId_externoId_idx" ON "vendas"("empresaId", "externoId");

