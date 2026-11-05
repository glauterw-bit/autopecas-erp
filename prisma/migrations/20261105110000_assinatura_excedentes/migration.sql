-- AlterTable
ALTER TABLE "planos" ADD COLUMN     "precoCnpjAdicional" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "precoNotaExcedente" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "precoUsuarioExtra" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "consumo_notas_mes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "notas" INTEGER NOT NULL DEFAULT 0,
    "excedentes" INTEGER NOT NULL DEFAULT 0,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumo_notas_mes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consumo_notas_mes_empresaId_mes_key" ON "consumo_notas_mes"("empresaId", "mes");

-- AddForeignKey
ALTER TABLE "consumo_notas_mes" ADD CONSTRAINT "consumo_notas_mes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
