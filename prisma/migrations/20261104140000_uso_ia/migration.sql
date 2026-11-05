-- CreateTable
CREATE TABLE "uso_ia" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "recurso" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "tokensEntrada" INTEGER NOT NULL DEFAULT 0,
    "tokensCache" INTEGER NOT NULL DEFAULT 0,
    "tokensSaida" INTEGER NOT NULL DEFAULT 0,
    "custoUsd" DECIMAL(14,8) NOT NULL,
    "sucesso" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uso_ia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "uso_ia_empresaId_criadoEm_idx" ON "uso_ia"("empresaId", "criadoEm");

