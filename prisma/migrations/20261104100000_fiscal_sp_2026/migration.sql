-- Fiscal SP nov/2026: fim da ST de autopeças, PIS/COFINS por produto, IBS/CBS e devolução referenciada.

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN "monofasicoPisCofins" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "cstIbsCbs" TEXT,
ADD COLUMN "cClassTrib" TEXT;

-- AlterTable
ALTER TABLE "itens_venda" ADD COLUMN "numeroItemNota" INTEGER,
ADD COLUMN "fiscalNota" JSONB,
ADD COLUMN "quantidadeDevolvidaNota" DECIMAL(14,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "itens_nota_entrada" ADD COLUMN "cest" TEXT,
ADD COLUMN "cstIcms" TEXT,
ADD COLUMN "vBcSt" DECIMAL(14,2),
ADD COLUMN "vIcmsSt" DECIMAL(14,2),
ADD COLUMN "vBcStRet" DECIMAL(14,2),
ADD COLUMN "vIcmsStRet" DECIMAL(14,2),
ADD COLUMN "vIcmsSubstituto" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "notas_fiscais" ADD COLUMN "valorIbs" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "valorCbs" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "finalidade" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "tipoDocumento" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "chaveReferenciada" TEXT,
ADD COLUMN "mensagemSefaz" TEXT,
ADD COLUMN "refProvedor" TEXT;

-- AlterTable
ALTER TABLE "solicitacoes_rma" ADD COLUMN "notaDevolucaoId" TEXT;
