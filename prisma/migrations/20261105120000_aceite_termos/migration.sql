-- CreateTable
CREATE TABLE "aceites_termos" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "versao" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "aceitoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aceites_termos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aceites_termos_empresaId_aceitoEm_idx" ON "aceites_termos"("empresaId", "aceitoEm");

-- CreateIndex
CREATE UNIQUE INDEX "aceites_termos_usuarioId_documento_versao_key" ON "aceites_termos"("usuarioId", "documento", "versao");

