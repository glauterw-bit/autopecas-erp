-- Alerta próprio para venda de marketplace que precisa de revisão humana
-- (cancelada com nota emitida ou com pagamento parcial já recebido).
ALTER TYPE "TipoInsight" ADD VALUE IF NOT EXISTS 'VENDA_REVISAO';
