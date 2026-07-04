-- Idempotência real de pedidos externos (Vallente/ML): unique em vez de índice
DROP INDEX IF EXISTS "vendas_empresaId_externoId_idx";
CREATE UNIQUE INDEX "vendas_empresaId_externoId_key" ON "vendas"("empresaId", "externoId");

-- Uma única sessão de caixa aberta por usuário (guarda contra corrida na abertura)
CREATE UNIQUE INDEX IF NOT EXISTS "sessoes_caixa_aberta_por_usuario"
  ON "sessoes_caixa" ("usuarioId") WHERE "fechadaEm" IS NULL;
