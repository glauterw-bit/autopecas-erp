-- CreateTable
CREATE TABLE "eventos_webhook" (
    "id" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "idExterno" TEXT NOT NULL,
    "empresaId" TEXT,
    "contaId" TEXT,
    "topico" TEXT,
    "recurso" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "payload" JSONB,
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processadoEm" TIMESTAMP(3),

    CONSTRAINT "eventos_webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compatibilidades_ml_cache" (
    "id" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "dominio" TEXT NOT NULL,
    "produtosMl" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "detalhe" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compatibilidades_ml_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pix_recorrencias" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "periodicidade" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CRIADA',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pix_recorrencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eventos_webhook_status_recebidoEm_idx" ON "eventos_webhook"("status", "recebidoEm");

-- CreateIndex
CREATE INDEX "eventos_webhook_empresaId_recebidoEm_idx" ON "eventos_webhook"("empresaId", "recebidoEm");

-- CreateIndex
CREATE UNIQUE INDEX "eventos_webhook_origem_idExterno_key" ON "eventos_webhook"("origem", "idExterno");

-- CreateIndex
CREATE UNIQUE INDEX "compatibilidades_ml_cache_versaoId_key" ON "compatibilidades_ml_cache"("versaoId");

-- CreateIndex
CREATE INDEX "pix_recorrencias_empresaId_idx" ON "pix_recorrencias"("empresaId");

