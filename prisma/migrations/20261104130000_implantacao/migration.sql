-- CreateTable
CREATE TABLE "importacao_lotes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "entidade" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "arquivoNome" TEXT,
    "simulacao" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL,
    "resumo" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importacao_lotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importacao_chaves" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "loteId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "importacao_chaves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "importacao_lotes_empresaId_criadoEm_idx" ON "importacao_lotes"("empresaId", "criadoEm");

-- CreateIndex
CREATE INDEX "importacao_chaves_entidade_entidadeId_idx" ON "importacao_chaves"("entidade", "entidadeId");

-- CreateIndex
CREATE UNIQUE INDEX "importacao_chaves_empresaId_entidade_chave_key" ON "importacao_chaves"("empresaId", "entidade", "chave");

-- AddForeignKey
ALTER TABLE "importacao_lotes" ADD CONSTRAINT "importacao_lotes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importacao_chaves" ADD CONSTRAINT "importacao_chaves_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

