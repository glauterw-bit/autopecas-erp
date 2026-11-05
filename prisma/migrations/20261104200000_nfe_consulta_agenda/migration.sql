-- AlterEnum
ALTER TYPE "TipoInsight" ADD VALUE IF NOT EXISTS 'NFE_PENDENTE';

-- AlterTable
ALTER TABLE "notas_fiscais" ADD COLUMN "consultaTentativas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "ultimaConsultaEm" TIMESTAMP(3),
ADD COLUMN "proximaConsultaEm" TIMESTAMP(3),
ADD COLUMN "revisaoEm" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "notas_fiscais_status_proximaConsultaEm_idx" ON "notas_fiscais"("status", "proximaConsultaEm");
