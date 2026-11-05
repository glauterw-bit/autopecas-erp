-- CreateEnum
CREATE TYPE "StatusAssinatura" AS ENUM ('TRIAL', 'ATIVA', 'INADIMPLENTE', 'SUSPENSA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "CicloAssinatura" AS ENUM ('MENSAL', 'ANUAL');

-- CreateTable
CREATE TABLE "planos" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "precoMensal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "precoAnual" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "limiteUsuarios" INTEGER,
    "limiteDepositos" INTEGER,
    "limiteNotasMes" INTEGER,
    "limiteProdutos" INTEGER,
    "modulos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publico" BOOLEAN NOT NULL DEFAULT true,
    "provisorio" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assinaturas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "status" "StatusAssinatura" NOT NULL DEFAULT 'TRIAL',
    "ciclo" "CicloAssinatura" NOT NULL DEFAULT 'MENSAL',
    "trialFimEm" TIMESTAMP(3),
    "formaPagamento" TEXT,
    "asaasClienteId" TEXT,
    "asaasAssinaturaId" TEXT,
    "proximoVencimento" TIMESTAMP(3),
    "inadimplenteDesde" TIMESTAMP(3),
    "suspensaMotivo" TEXT,
    "canceladaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assinaturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aceites_termos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "versao" TEXT NOT NULL,
    "ip" TEXT,
    "aceitoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aceites_termos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planos_codigo_key" ON "planos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_empresaId_key" ON "assinaturas"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_asaasAssinaturaId_key" ON "assinaturas"("asaasAssinaturaId");

-- CreateIndex
CREATE INDEX "assinaturas_status_idx" ON "assinaturas"("status");

-- CreateIndex
CREATE INDEX "aceites_termos_empresaId_idx" ON "aceites_termos"("empresaId");

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "planos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aceites_termos" ADD CONSTRAINT "aceites_termos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Dados: planos de exemplo (PROVISÓRIOS, preço zero, a definir pelo dono) e o
-- plano INTERNO sem limite. Toda empresa que já existe vira ATIVA no INTERNO,
-- então nenhuma loja é bloqueada por esta migração.
-- ---------------------------------------------------------------------------
INSERT INTO "planos" ("id","codigo","nome","descricao","precoMensal","precoAnual","limiteUsuarios","limiteDepositos","limiteNotasMes","limiteProdutos","modulos","publico","provisorio","ativo","atualizadoEm") VALUES
 ('plano_interno','INTERNO','Interno','Lojas implantadas à mão pelo dono (sem limite, sem cobrança automática).',0,0,NULL,NULL,NULL,NULL,ARRAY['MARKETPLACES','IA','B2B','CONTABIL'],false,false,true,CURRENT_TIMESTAMP),
 ('plano_inicial','INICIAL','Inicial (PROVISÓRIO)','PROVISÓRIO: valores e limites de exemplo, ainda não definidos.',0,0,2,1,200,5000,ARRAY[]::text[],true,true,true,CURRENT_TIMESTAMP),
 ('plano_profissional','PROFISSIONAL','Profissional (PROVISÓRIO)','PROVISÓRIO: valores e limites de exemplo, ainda não definidos.',0,0,5,2,1000,30000,ARRAY['MARKETPLACES','IA'],true,true,true,CURRENT_TIMESTAMP),
 ('plano_completo','COMPLETO','Completo (PROVISÓRIO)','PROVISÓRIO: valores e limites de exemplo, ainda não definidos.',0,0,NULL,NULL,NULL,NULL,ARRAY['MARKETPLACES','IA','B2B','CONTABIL'],true,true,true,CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "assinaturas" ("id","empresaId","planoId","status","ciclo","atualizadoEm")
SELECT 'ass_' || e."id", e."id", p."id", 'ATIVA', 'MENSAL', CURRENT_TIMESTAMP
FROM "empresas" e CROSS JOIN "planos" p
WHERE p."codigo" = 'INTERNO'
  AND NOT EXISTS (SELECT 1 FROM "assinaturas" a WHERE a."empresaId" = e."id");
