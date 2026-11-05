-- Índices de busca de peça no balcão (catálogo de ~50 mil produtos por loja).
-- Medição antes/depois com 50 mil produtos: scripts/gerar-massa-busca.ts.

CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- unaccent() é STABLE e não pode entrar em índice. Estes wrappers fixam o
-- dicionário e são IMMUTABLE, o que permite índice por expressão.
-- A busca (src/lib/catalogo/busca.ts) usa exatamente as mesmas expressões.

-- Texto: minúsculo e sem acento ("Óleo Diant." -> "oleo diant.").
CREATE OR REPLACE FUNCTION busca_texto(t text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, t)) $$;

-- Código: maiúsculo, sem acento e só letras e números ("45022-sna.a00" -> "45022SNAA00").
-- Deve bater com normalizarCodigo() em src/lib/catalogo/busca-normalizar.ts.
CREATE OR REPLACE FUNCTION busca_codigo(t text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT regexp_replace(upper(public.unaccent('public.unaccent'::regdictionary, t)), '[^A-Z0-9]', '', 'g') $$;

-- Todos os códigos do produto numa string só (SKU, EAN, fabricante, OEM), separados por espaço.
CREATE OR REPLACE FUNCTION busca_codigos(sku text, ean text, fab text, oem text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT coalesce(busca_codigo(sku), '') || ' ' || coalesce(busca_codigo(ean), '') || ' '
            || coalesce(busca_codigo(fab), '') || ' ' || coalesce(busca_codigo(oem), '') $$;

-- PDV: palavras da descrição ("past diant sprinter") e similaridade (erro de digitação).
CREATE INDEX IF NOT EXISTS "produtos_busca_texto_nome_trgm_idx"
  ON "produtos" USING GIN (busca_texto("nome") gin_trgm_ops);

-- PDV: parte do código, com ou sem traço/ponto/espaço, em qualquer um dos 4 códigos.
CREATE INDEX IF NOT EXISTS "produtos_busca_codigos_trgm_idx"
  ON "produtos" USING GIN (busca_codigos("sku", "codigoBarras", "codigoFabricante", "codigoOem") gin_trgm_ops);

-- Listagem /api/produtos?q= (Prisma gera "nome" ILIKE '%q%' e "sku" ILIKE '%q%').
CREATE INDEX IF NOT EXISTS "produtos_nome_trgm_idx" ON "produtos" USING GIN ("nome" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "produtos_sku_trgm_idx" ON "produtos" USING GIN ("sku" gin_trgm_ops);

-- Busca por modelo/ano via aplicação veicular: versões de um modelo.
CREATE INDEX IF NOT EXISTS "versoes_veiculo_modeloId_idx" ON "versoes_veiculo" ("modeloId");
