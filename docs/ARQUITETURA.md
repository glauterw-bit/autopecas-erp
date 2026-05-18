# Arquitetura técnica — AutoPeças ERP

Documento descrevendo as decisões arquiteturais por trás do AutoPeças ERP e como ele se diferencia da concorrência tecnicamente.

## 1. Princípios

1. **Monorepo Next.js, server-first.** Server Components reduzem JS no cliente e dão acesso direto ao Prisma sem custo de API. Rotas API só existem onde o browser precisa chamar (PDV, IA, webhooks).
2. **Multi-tenant nativo.** Toda entidade transacional carrega `empresaId`. Não há "depois a gente separa" — é o tipo de retrabalho que mata produto sério.
3. **IA como camada, não como feature.** Cada módulo tem hooks de IA opcionais, todos passando pelo mesmo cliente `lib/ai/client.ts` com prompt caching ativado.
4. **Aplicação veicular é cidadão de primeira classe.** A estrutura Montadora → Modelo → Versão → Aplicação é o que separa um ERP genérico de um ERP de auto peças.
5. **Idempotência sempre.** Webhooks de marketplace, sincronia de estoque, jobs de IA — tudo desenhado para reexecução sem efeito colateral.

## 2. Decisões importantes

### 2.1 Por que Claude (Anthropic) e não outro provedor?

- **Visão computacional** robusta o suficiente para identificar peças e ler DANFEs (~97% de acurácia em OCR fiscal nos benchmarks de IDP).
- **Tool use** confiável — viabiliza CopilotoBalcão que executa funções reais no banco.
- **Prompt caching** reduz custo em ~75% quando o system prompt repete (caso de praticamente toda chamada do nosso sistema).
- **Janela de contexto** de 1M tokens permite passar catálogos inteiros como contexto quando útil.

### 2.2 Por que PostgreSQL + pgvector e não Pinecone/Weaviate?

- Operação local, sem dependência extra.
- `pgvector` resolve busca semântica de produto dentro do mesmo banco — operações ACID + similaridade vetorial.
- `pg_trgm` + `unaccent` cobrem a busca fonética/de digitação que é 80% do uso no PDV.
- Quando a base crescer, migra-se a parte vetorial para um serviço dedicado sem tocar no core.

### 2.3 Por que Focus NFe (e não emissão própria)?

A emissão de NF-e exige certificado A1, integração com 27 SEFAZ + DF, fila com tentativas, contingência. Reimplementar isso é trabalho para 6 meses de uma equipe dedicada. Provedores como Focus, Webmania, eNotas resolvem a 1-2 reais por documento e mantêm 99.9% de uptime — o ERP cuida do payload e da experiência, eles cuidam do canal SEFAZ.

### 2.4 BullMQ + Redis para filas

- **sync-marketplaces** roda a cada 15 min por conta ativa.
- **stockpredict-batch** roda 03h da manhã, gera insights de ruptura.
- **margin-guard-batch** roda 04h, sinaliza produtos sub-precificados.
- **ocr-nf-fila** processa DANFEs em batch quando o lojista envia várias.
- **whatsapp-inbox** processa mensagens em ordem, mantém contexto por número.

## 3. Fluxos críticos

### 3.1 Venda no PDV

```
[Bipe / busca]
     ↓
GET /api/produtos/buscar-pdv?q=...
     ↓ pgtrgm + match exato + aplicação (versaoId)
[Carrinho]
     ↓
[Finalizar]
     ↓
POST /api/vendas
     ↓ transação:
        - cria Venda + ItemVenda (com MarginGuard inline)
        - baixa estoque (MovimentoEstoque tipo SAIDA)
        - cria ContaReceber se parcelado
     ↓
[Emissão fiscal opcional]
POST /api/vendas/[id]/faturar → Focus NFe → NotaFiscal autorizada
```

### 3.2 Entrada de NF via NF-IA

```
[Upload DANFE]
     ↓
POST /api/ia/ocr-nf  (Claude Sonnet vision)
     ↓
[JSON estruturado: emitente, itens com NCM/CFOP/valores]
     ↓
[Conferência humana + match com SKU existente]
     ↓
[Criar NotaEntrada + ItemNotaEntrada]
     ↓
[Atualizar custo médio, estoque, sugerir preço de venda]
```

### 3.3 Sincronia de marketplace

```
[Cron 15 min]  →  worker.sincronizarConta(contaId)
     ↓
[adaptador.listarAnuncios]   → upsert MarketplaceAnuncio
[adaptador.listarPedidosRecentes]   → upsert MarketplacePedido
     ↓ se pedido novo, criar Venda + reserva estoque
[adaptador.listarMensagensNaoLidas]   → upsert MensagemMarketplace
     ↓ Haiku gera rascunho_ia automaticamente
```

### 3.4 StockPredict diário

```
[Cron 03h]
     ↓
[Para cada produto curva A/B]:
     - historicoVendas(30d, 90d)
     - heurística: cobertura, ponto reposição, qtd sugerida
     - explicarComIA(contexto) → fatores externos do mês
     - se risco ALTO/IMINENTE → InsightIA(RUPTURA_PREDITIVA)
     ↓
[Dashboard mostra insights no topo]
```

## 4. Segurança

- Senhas via bcrypt + TOTP opcional.
- Permissões granulares por perfil + lista `permissoes[]` no usuário.
- `LogAuditoria` com snapshot antes/depois das mutações sensíveis.
- Tokens de marketplace **cifrados em rest** via coluna `@db.Text` (em produção, KMS).
- Rate limiting nas rotas de IA (a ser implementado).
- Multi-tenancy por `empresaId` em todas as queries.

## 5. Performance

- Server Components reduzem JS no cliente — PDV carrega rápido mesmo em rede 3G.
- Prisma com `select` explícito em queries hot.
- Índices compostos em `(empresaId, ativo)`, `(empresaId, criadaEm)`, etc.
- Prompt caching no Claude → custo de chamadas idênticas cai ~75%.
- Cache de produtos consultados frequentemente via TanStack Query no cliente.

## 6. Pontos de extensão

- **Adaptadores de marketplace**: implementar `AdaptadorMarketplace` em `lib/marketplaces/*` e registrar em `unified.ts`. Custo de adicionar novo canal: ~150 linhas.
- **Emissores fiscais**: trocar Focus por Webmania alterando só `lib/nfe/emissor.ts`.
- **Provedores de consulta de placa**: `lib/catalogo/placa.ts` aceita qualquer endpoint, falha gracioso.
- **Modelos de IA**: trocar `AI_MODELS` em `lib/ai/client.ts` aplica em todo o sistema.
- **Catálogos veiculares externos**: criar import job que popula `Montadora/ModeloVeiculo/VersaoVeiculo` a partir de feed TecDoc/Cinoa.
