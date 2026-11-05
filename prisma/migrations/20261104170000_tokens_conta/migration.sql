-- CreateTable
CREATE TABLE "tokens_conta" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_conta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_conta_tokenHash_key" ON "tokens_conta"("tokenHash");

-- CreateIndex
CREATE INDEX "tokens_conta_usuarioId_tipo_idx" ON "tokens_conta"("usuarioId", "tipo");

-- AddForeignKey
ALTER TABLE "tokens_conta" ADD CONSTRAINT "tokens_conta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
