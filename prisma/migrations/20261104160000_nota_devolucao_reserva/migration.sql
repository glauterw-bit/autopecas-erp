-- Reserva da NF-e de devolução e consulta de notas em processamento
ALTER TABLE "notas_fiscais" ADD COLUMN "devolucaoItens" JSONB;
CREATE INDEX "notas_fiscais_refProvedor_idx" ON "notas_fiscais"("refProvedor");
CREATE INDEX "notas_fiscais_status_dataEmissao_idx" ON "notas_fiscais"("status", "dataEmissao");
