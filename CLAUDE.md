# AutoPeças ERP

ERP + CRM SaaS multi-empresa para lojas de autopeças no Brasil: cadastro com aplicação veicular, balcão/PDV, estoque, compras, fiscal (NF-e, NFC-e, SPED), financeiro, contábil, marketplaces, portal B2B para oficinas e IA.

O primeiro cliente provável é a loja de peças para vans e utilitários diesel de Taboão da Serra/Cotia-SP. Ela já usa o **Radar Autopeças** (`~/radar-autopecas`), que é o atendimento por WhatsApp e **não** é este projeto.

O centro do valor é a loja vender mais e errar menos: achar a peça certa rápido, nota fiscal que sai certa, estoque que bate e nenhum cliente esquecido.

## Onde fica cada coisa
- `src/app/`: Next.js 15 (App Router, React 19).
  - `(app)/*`: telas internas. São elas: dashboard, pdv, caixa, produtos, estoque, compras, fornecedores, clientes, veiculos, financeiro, fiscal, contabil, marketplaces, os, rma, comissoes, relatorios, ia, hardware e configuracoes.
  - `api/*`: 66 rotas.
  - `b2b/`: portal das oficinas.
  - `m/`: PWA do vendedor externo.
- `src/lib/`: regra de negócio.
  - `fiscal/`: `calculo.ts` (ICMS, ST, DIFAL, IPI, PIS/COFINS), `simples-nacional.ts` e `declaracoes.ts`.
  - `nfe/`: `emissor.ts` (Focus NFe), `importar-xml.ts`, `nfse.ts`, `mdfe.ts`, `cte.ts` e `operacoes.ts`.
  - `contabil/`: `sped.ts`, `sped-contribuicoes.ts`, `lancamentos.ts` (partidas dobradas), `dre.ts`, `balanco.ts` e `plano-contas.ts`.
  - `financeiro/`: OFX e conciliação.
  - `pagamentos/`: Pix e Pix Automático.
  - `marketplaces/`: ML, Shopee, Amazon, Magalu e WhatsApp, atrás de `unified.ts`.
  - `catalogo/`: busca, placa e TecDoc.
  - `vendas/`: crediário, política de desconto e promoções.
  - `compras/receber-nota.ts`: custo médio.
  - `pdv/`: clientes do agente local.
  - `ai/`: OpenAI.
  - `auth/`: guard, RBAC e rate limit.
  - `sessao.ts`: tenant pela sessão.
- `src/workers/`: BullMQ. Faz o sync dos marketplaces, StockPredict, MarginGuard e TecDoc mensal.
- `prisma/schema.prisma`: 60 models. As migrações versionadas ficam em `prisma/migrations/` e o seed em `prisma/seed.ts`.
- `agente-pdv/`: executável Node que roda **na máquina da loja**, só em 127.0.0.1. Atende TEF em 60906, SAT em 60907 e balança em 60908.
- `scripts/bootstrap.ts`: roda no start. Aplica `prisma migrate deploy`, com baseline automático, e semeia o banco vazio.
- `scripts/nova-empresa.ts`: cria um tenant.
- `docs/`:
  - `AUDITORIA-2026-07.md`: o que mudar, melhorar e adicionar, com notas por frente.
  - `ARQUITETURA.md`.
  - `COMPARATIVO-CONCORRENTES.md`.
  - `INTEGRACAO-VALLENTE.md`.
  - `MOBILE.md`.
  - `estrategia.md`: apostas e medição.
  - `conhecimento/`: pesquisa do mundo, por área.
- IA: `src/lib/ai/client.ts` com `AI_MODELS`. Usa gpt-4o (visão, OCR, raciocínio) e gpt-4o-mini (rápido). Troque o modelo só ali.

## Publicar
- **Só com pedido explícito do dono na conversa.**
- Railway: projeto `autopecas-erp`, serviço `autopecas-app`. Rode `railway up` a partir da raiz, ou faça push no GitHub `glauterw-bit/autopecas-erp`, se o deploy automático estiver ligado (confirme antes).
  - Build Nixpacks com Node 20: `npm install --legacy-peer-deps && npm run build`.
  - Start: `npm run start`, que roda o bootstrap (migrations) e o `next start`.
  - Healthcheck: `/api/health`.
- Depois de subir, confira `railway deployment list --service autopecas-app`, os logs do `[bootstrap]` e o `/api/health`.
- Migração:
  - Crie com `npx prisma migrate dev --name <nome>` contra um banco local. Ela é aplicada no boot.
  - Nunca edite uma migração já aplicada e nunca use `db push` em produção.
- Worker (`npm run worker`): é outro processo e precisa de `REDIS_URL`. Confirme se existe serviço de worker no Railway antes de contar com os jobs.
- Agente do PDV: a pasta `agente-pdv/` é copiada para a máquina da loja (veja o README dela). Mudou o contrato? Então mude junto `src/lib/pdv/*` e o agente.
- Em jul/2026 o trial do Railway expirou e o deploy bloqueou. Se `railway up` falhar por plano, avise o dono, não contorne.

## Testar
- `npx tsc --noEmit`: tipos.
- `npm test`: vitest. Hoje são 19 testes em `src/lib/fiscal/calculo.test.ts`, `src/lib/auth/config.test.ts` e `src/lib/b2b/sessao.test.ts`.
- Teste novo fica ao lado do arquivo (`*.test.ts`). Fiscal e financeiro **sempre** com teste de valor, em centavos.
- `npm run build`: o build do Next pega erro de rota e de server component que o tsc não pega.
- Para rodar local:
  - Postgres com pgvector: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=autopecas_erp pgvector/pgvector:pg16`.
  - Copie `.env.example` para `.env`.
  - `npx prisma migrate dev`, `npm run db:seed` e `npm run dev`.
- Fiscal: emita sempre em **homologação** (`FOCUS_NFE_AMBIENTE=homologacao`). Nunca emita nota de teste em produção, porque nota em produção tem valor legal.

## Cuidados da máquina e da stack
- Dinheiro em `Decimal` (Prisma) ou centavos inteiros, nunca `float`. Arredonde por item conforme a regra da NF-e.
- Multi-tenant:
  - Toda consulta filtra por `empresaId`, que vem da sessão (`exigirSessao`/`comAuth` em `src/lib/auth/guard.ts`) e nunca do corpo da requisição.
  - Rota nova sem `comAuth(perfil)` é bug. As exceções são login, logout, health e webhooks assinados.
- Perfis, em ordem hierárquica: ADMIN, GERENTE, FINANCEIRO, VENDEDOR, CAIXA, ESTOQUISTA, TECNICO. Financeiro, contábil e fiscal exigem FINANCEIRO ou acima.
- SQL cru: as colunas são camelCase entre aspas (`"empresaId"`). Já quebrou produção uma vez.
- Webhooks:
  - Valide a assinatura: HMAC da Shopee, `X-Hub-Signature-256` da Meta e `WEBHOOK_TOKEN`.
  - Processamento idempotente e enfileirado.
- Marketplaces: pagine até o fim e respeite 429/`Retry-After`.
- Vallente Hub:
  - Está em produção com clientes ativos. Nunca dispare `export-sales` com backfill grande, que já derrubou o Postgres dele.
  - A chave `vlt_` é segredo.
- `npm install` precisa de `--legacy-peer-deps`.

## Dados e números
- Os números do produto vêm do banco do tenant: `Venda`, `ItemVenda`, `Produto`, `MovimentoEstoque` (kardex), `ContaReceber` e `ContaPagar`.
- Venda só conta quando estiver faturada, não orçamento.
- Margem depende de custo médio atualizado na entrada (`receber-nota.ts`).
- Nunca invente números, depoimentos, avaliações, alíquotas ou datas de lei. Hipótese é dita como hipótese. Regra fiscal sempre com a fonte (lei, convênio, NT).
- O seed é dado de demonstração. Não o apresente como dado real de cliente.

## Regras de produto
- Nota fiscal errada é multa para o cliente. Na dúvida fiscal, o sistema bloqueia e explica; não "deixa passar".
- Toda alteração de preço, estoque, desconto acima da política, cancelamento e estorno gera `LogAuditoria` com antes e depois.
- LGPD:
  - CPF/CNPJ, crédito e contas só aparecem para o perfil que precisa.
  - Nada disso vai para prompt de IA sem necessidade.
  - Logs não guardam documento completo.
- A IA sugere e o humano confirma: preço, compra, cross-reference e resposta a cliente.
- A IA nunca inventa preço ou estoque.
- Texto de tela em português do Brasil, direto, sem jargão contábil quando o usuário for balconista. Não suponha gênero.
- PDV: teclado primeiro, rápido, funciona com leitor de código de barras. Uma venda de balcão não pode depender de clique fino.

## Time de agentes
Os agentes ficam em `.claude/agents/` (prefixo `erp-`).
- Para pôr o time inteiro num objetivo, use `/time <objetivo>`.
- Para um agente só, comece pelo `erp-produto`.
- Antes de qualquer publicação, passe a mudança pelo `erp-revisor`.
- Para refazer a pesquisa do mundo, use `/atualizar-conhecimento [área]`.
