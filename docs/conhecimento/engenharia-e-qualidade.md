# Engenharia e qualidade: AutoPeças ERP

Pesquisa de 04/11/2026. **[E]** = evidência com link. **[H]** = hipótese nossa, a validar.

## 1. Next 15 / React 19

- **Toda Server Action é um endpoint público.** Ela pode ser chamada por POST direto. Por isso cada action precisa checar sessão e autorização por conta própria: a checagem feita na página não cobre a action. [E](https://nextjs.org/docs/app/guides/data-security)
- **Data Access Layer.** Para projeto novo, o Next recomenda uma camada `server-only` que autoriza o acesso e devolve DTOs mínimos, nunca o registro cru. [E](https://nextjs.org/docs/app/guides/data-security)
- **Action ou route handler.** Use action para formulário interno. Use route handler para o que é chamado de fora: PDV via fetch, Capacitor, webhooks, `agente-pdv` e Vallente. [H] Hoje não há nenhuma `"use server"` no projeto. Tudo passa por `src/app/api/**` com `comAuth()` (`src/lib/auth/guard.ts`). Se o projeto adotar actions, elas devem chamar o mesmo guard.
- **Cache.** No modelo sem Cache Components:
  - `fetch` não é cacheado por padrão. [E](https://nextjs.org/docs/app/guides/caching-without-cache-components)
  - Consulta de ORM só entra em cache via `unstable_cache` com tags, e a invalidação usa `revalidateTag`/`revalidatePath`. [E](https://nextjs.org/docs/app/guides/caching-without-cache-components)
  - Estoque, preço e caixa ficam fora de cache compartilhado. Toda chave de cache leva `empresaId`. [H]

## 2. Prisma multi-tenant

- **Situação atual.** O `empresaId` já vem só da sessão (`src/lib/sessao.ts`). Mas o isolamento ainda depende de cada consulta lembrar o `where`. Esse é o risco nº 1 da OWASP API, BOLA. [E](https://api-security.owasp.org/editions/2023/en/0x11-t10)
- **Defesa em camadas:**
  - **Extensão `$extends` (componente `query`)** que injeta o `empresaId` em toda consulta. A Prisma cita o RLS como caso de uso de client estendido por requisição. [E](https://www.prisma.io/docs/orm/prisma-client/client-extensions)
  - **RLS no Postgres.** Sem política, vale default-deny. O dono da tabela só fica sujeito ao RLS com `FORCE ROW LEVEL SECURITY`, e quem tem `BYPASSRLS` ignora o RLS. [E](https://www.postgresql.org/docs/16/ddl-rowsecurity.html)
  - **Padrão comum:** `set_config('app.tenant', id, true)` na mesma transação da consulta. Atenção: transações interativas não herdam o valor. [E](https://atlasgo.io/guides/orms/prisma/row-level-security)
  - **Conexão** com um papel que não é dono das tabelas. [H]

## 3. Migrações sem downtime

- O `scripts/bootstrap.ts` roda `prisma migrate deploy` antes do `next start`. Uma migração que trave uma tabela grande derruba o deploy. [H]
- **Expandir e contrair.** Cria-se a estrutura nova, copiam-se os dados, e a antiga só é removida quando ninguém mais lê dela. [E](https://www.prisma.io/docs/guides/database/data-migration)
- **Regras práticas:** nada de `NOT NULL` sem default em tabela grande, `CREATE INDEX CONCURRENTLY` fora de transação, backfill em lotes no worker, `lock_timeout` curto. [H]
- **Versão.** A Prisma já documenta o ORM 7 e um RC do 8 [E](https://www.prismagraphql.com/docs/orm/prisma-migrate/workflows/customizing-migrations); o projeto está no 5.22. [H]

## 4. BullMQ: retry e idempotência

- **Retry.** `attempts` acima de 1, backoff fixo ou exponencial (`2^(n-1)*delay`) e jitter. Sem backoff, o retry é imediato. [E](https://docs.bullmq.io/guide/retrying-failing-jobs) O `src/workers/queues.ts` já usa 3 tentativas com backoff exponencial de 5 s.
- **Idempotência.** O `jobId` customizado evita duplicata **só enquanto o job anterior existe**. Depois de `removeOnComplete`, o mesmo id entra de novo. [E](https://docs.bullmq.io/guide/jobs/job-ids)
- **Idempotência de verdade:** chave única no banco `(empresaId, origem, idExterno)`, gravada na transação do efeito. [H]

## 5. Dinheiro e arredondamento

- **Schema.** Usa `Decimal` (126 ocorrências). `Float` aparece só em scores e confiança, o que está correto.
- **Bordas.** `src/lib/ai/chat.ts:151` converte `custoMedio` com `Number()`, e `margin-guard.ts` calcula em `number`. Isso vale para exibir, não para gravar preço, desconto ou imposto. [H]
- **Regra:**
  - calcular em `Prisma.Decimal` ou em centavos inteiros;
  - arredondar uma vez por item, num único módulo;
  - conferir que a soma dos itens bate com o total da nota (diferença de centavo gera rejeição). [H, conferir no MOC vigente]

## 6. Testes enxutos

- **Hoje** há 3 arquivos de teste (`fiscal/calculo`, `auth/config`, `b2b/sessao`).
- **Golden files.** Um conjunto fixo de vendas gera o payload da NF-e e o SPED, e o resultado é comparado com arquivos aprovados. Todo diff passa por revisão humana. É o teste mais barato contra "nota que sai errada". [H]
- **Testes de propriedade (fast-check):** soma dos itens = total, imposto ≥ 0, rateio de frete fecha no centavo. [H]
- **Tenant cruzado.** Duas empresas; logado na B, tentar ler a A em cada rota. [H]

## 7. Observabilidade

- Logs JSON com `requestId`, `empresaId` e latência, erros num agregador (hoje `respostaErro()` só faz `console.error`) e alarmes de negócio: fila parada, nota rejeitada, webhook mudo, custo de IA por loja. [H]

## 8. Segurança

- **Checklist: OWASP API Top 10 2023.** Os itens que mais pegam ERP:
  - BOLA (autorização por objeto);
  - autenticação;
  - consumo irrestrito de recursos;
  - fluxos sensíveis de negócio.
  [E](https://api-security.owasp.org/editions/2023/en/0x11-t10)
- **Rate limit.** Existe um limiter em memória (`src/lib/auth/rate-limit.ts`, função `permitido`), usado só nos logins interno e B2B (corrigido em 04/11/2026 na revisão: a pesquisa original disse que não havia). Ele zera a cada deploy e não funciona com mais de uma instância; as rotas de IA e as outras rotas caras não têm limite. O Next sugere limitar também as actions caras. [E](https://nextjs.org/docs/app/guides/data-security)
- **Webhooks.**
  - O WhatsApp já valida HMAC com `timingSafeEqual`.
  - Pix e marketplaces comparam um token em query string, que vaza em log.
  - Correção: HMAC por plataforma ou token no header. [H]
- **Segredos.** Tokens de marketplace e certificado A1 ficam cifrados com chave fora do banco. Com mais de uma réplica, fixar `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`. [E](https://nextjs.org/docs/app/guides/data-security)

## 9. LGPD em ERP

- **Base legal.** Nota e cadastro: obrigação legal e contrato. Marketing: em geral consentimento. [H]
- **Retenção.** O Ajuste SINIEF 2/2025 fala em 132 meses (11 anos) de guarda do XML. Há divergência se isso obriga o contribuinte, e a decadência do CTN segue em 5 anos. [E](https://www.contabeis.com.br/artigos/70492/novo-ajuste-sinief-exige-guarda-de-documentos-fiscais-por-11-anos/) [E](https://blog.econeteditora.com.br/padronizado-prazo-de-guarda/)
  - Sugestão: guardar o XML por 11 anos e anonimizar o cliente PF inativo fora dos documentos fiscais. [H]
- **Incidente.** A Resolução CD/ANPD 15/2024 define:
  - aviso à ANPD em 3 dias úteis (6 para agente de pequeno porte);
  - registro do incidente guardado por pelo menos 5 anos.
  [E](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-aprova-o-regulamento-de-comunicacao-de-incidente-de-seguranca) [E](https://jornalcontabil.com.br/noticia/empresas-terao-ate-3-dias-para-comunicar-falhas-de-seguranca-com-dados-pessoais/amp/)
- **Papéis.** A loja é controladora e nós somos operadores (contrato e aviso rápido). Mascarar CPF/CNPJ em log e auditar exportações. [H]

## 10. Backup e recuperação

- **O que o Railway oferece.** Backup de volume:
  - diário, retido 6 dias;
  - semanal, retido 27 dias;
  - mensal, retido 89 dias.
  [E](https://docs.railway.com/reference/backups)
- **Limites desse backup.** O restore é só no mesmo projeto e ambiente, e apagar o volume apaga os backups. [E](https://docs.railway.com/reference/backups)
- **Logo:** `pg_dump` cifrado diário fora do Railway e restauração testada todo mês, com RTO/RPO medidos. [H]

## 11. PDV offline-first

- **Como os outros fazem:**
  - Shopify POS: segue vendendo em dinheiro e meio customizado sem internet e sincroniza ao reconectar. O cartão offline é um recurso à parte. [E](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/selling-offline)
  - Odoo POS: carrega o cadastro no navegador e enfileira os pedidos. [E](https://www.odoo.com/forum/help-1/how-is-the-point-of-sale-offline-mode-working-218314)
- **IndexedDB não é garantido.**
  - É "best-effort": o navegador pode apagar os dados sob pressão de espaço.
  - O Safari apaga dados de script após 7 dias sem interação.
  - Use `navigator.storage.persist()` e trate `QuotaExceededError`. [E](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
  - A fila de vendas fica mais segura no disco do `agente-pdv`. [H]
- **NFC-e em contingência offline** (tpEmis 9): transmitir em até 24 h, regra que varia por UF. [E](https://www.sefaz.pe.gov.br/Servicos/Nota-Fiscal-de-Consumidor-Eletronica/Paginas/contingencia.aspx)
- **Sincronização:** UUID gerado no cliente como chave idempotente, estoque reconciliado depois, nunca bloquear a venda por falta de rede. [H]

## 12. Limitações do Railway

- **IP fixo de saída.** Só no plano Pro, pode ser compartilhado com outros clientes e não recebe tráfego de entrada. Importa para PSP Pix e SEFAZ com allowlist. [E](https://docs.railway.com/reference/static-outbound-ips)
- **Builder.**
  - O Nixpacks aparece como obsoleto. O Railpack é o padrão e ignora `nixpacks.toml`. [E](https://station.railway.com/questions/about-nixpacks-builder-d515d570) [E](https://station.railway.com/questions/builder-keeps-switching-from-nixpacks-to-24e2021c)
  - O projeto usa `railway.toml` com `builder = "NIXPACKS"`.

## O que isso muda para o AutoPeças ERP

1. **Tenant em duas camadas.** Em `src/lib/db.ts`, um `prismaDaEmpresa(empresaId)` com `$extends`. Depois, uma migração nova em `prisma/migrations/` liga RLS com `FORCE` nas tabelas de dinheiro e cliente, usando um papel não-dono.
2. **Teste de tenant cruzado** em vitest, cobrindo cada rota de `src/app/api/**`.
3. **Rate limit em Redis**: trocar o limiter em memória de `src/lib/auth/rate-limit.ts` (hoje só nos logins) por Redis, mantendo a mesma interface, e aplicar também nas rotas de IA.
4. **Webhooks.** HMAC ou token no header em `api/webhooks/pix/route.ts` e `api/webhooks/marketplaces/route.ts`, mais uma tabela `EventoRecebido` com unique `(empresaId, origem, idExterno)`.
5. **Dinheiro.** `Prisma.Decimal` em `src/lib/ai/chat.ts:151` e `margin-guard.ts` quando o valor decide preço. Criar `src/lib/fiscal/arredondamento.ts` como ponto único de arredondamento.
6. **Testes fiscais.** Golden files em `tests/golden/` (NF-e/NFC-e e `src/lib/contabil/sped.ts`) e propriedades em `src/lib/fiscal/calculo.test.ts`.
7. **Migrações seguras.** `scripts/bootstrap.ts` com `lock_timeout`, backfill no worker e expandir/contrair.
8. **Backup externo.** `pg_dump` diário cifrado fora do Railway, com restauração testada todo mês.
9. **Contingência no PDV.** Fila de vendas em disco no `agente-pdv/`, UUID por venda e NFC-e offline. É o gap fiscal nº 1 da auditoria.
10. **Railway.** Migrar `railway.toml` para Railpack ou Dockerfile e avaliar o IP fixo do plano Pro.

## Fontes
- https://nextjs.org/docs/app/guides/data-security
- https://nextjs.org/docs/app/guides/caching-without-cache-components
- https://www.prisma.io/docs/orm/prisma-client/client-extensions
- https://www.prisma.io/docs/guides/database/data-migration
- https://www.prismagraphql.com/docs/orm/prisma-migrate/workflows/customizing-migrations
- https://www.postgresql.org/docs/16/ddl-rowsecurity.html
- https://atlasgo.io/guides/orms/prisma/row-level-security
- https://docs.bullmq.io/guide/jobs/job-ids
- https://docs.bullmq.io/guide/retrying-failing-jobs
- https://api-security.owasp.org/editions/2023/en/0x11-t10
- https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-aprova-o-regulamento-de-comunicacao-de-incidente-de-seguranca
- https://jornalcontabil.com.br/noticia/empresas-terao-ate-3-dias-para-comunicar-falhas-de-seguranca-com-dados-pessoais/amp/
- https://www.contabeis.com.br/artigos/70492/novo-ajuste-sinief-exige-guarda-de-documentos-fiscais-por-11-anos/
- https://blog.econeteditora.com.br/padronizado-prazo-de-guarda/
- https://www.sefaz.pe.gov.br/Servicos/Nota-Fiscal-de-Consumidor-Eletronica/Paginas/contingencia.aspx
- https://docs.railway.com/reference/backups
- https://docs.railway.com/reference/static-outbound-ips
- https://station.railway.com/questions/about-nixpacks-builder-d515d570
- https://station.railway.com/questions/builder-keeps-switching-from-nixpacks-to-24e2021c
- https://help.shopify.com/en/manual/sell-in-person/shopify-pos/selling-offline
- https://www.odoo.com/forum/help-1/how-is-the-point-of-sale-offline-mode-working-218314
- https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
