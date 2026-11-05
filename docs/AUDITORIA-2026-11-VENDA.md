# Auditoria "pronto para venda": AutoPeças ERP

**Data:** 04/11/2026. **Branch:** `main` (commit `b06f887`). **Feita por:** `erp-revisor` com `erp-produto`. Só leitura de código e checagens.

**Fora do escopo detalhado:** o que as apostas 1 a 7 de `docs/estrategia.md` já estão atacando em outras branches. São elas: fiscal SP e IBS/CBS, troca dos modelos de IA, mTLS e HMAC das integrações, Mercado Livre, venda perdida no balcão, CRM de oficina e importador de implantação. Quando um achado encosta numa aposta, isso aparece indicado.

## Veredito geral: NÃO PRONTO para venda

O motor por trás das telas é largo e, em boa parte, real. Mas três coisas impedem vender hoje:

1. **Não há como uma loja entrar, pagar e se configurar sozinha.** Também não existe contrato, termo de uso nem política de privacidade.
2. **Ainda há brechas em que uma loja mexe em dado de outra.** São 4 graves e 3 médias, todas conferidas no código.
3. **Metade das telas é vitrine.** Os botões de ação não existem, ou a tela mostra endpoint de API ao usuário. Além disso, o README e a página inicial prometem como pronto coisas que não estão prontas.

O caminho realista é a loja piloto da aposta 4, com implantação assistida e sem cobrança automática. Venda aberta a outras lojas só depois dos itens da seção "Para vender em 30 dias".

### O que foi verificado e como
- `npx tsc --noEmit`: passou (exit 0).
- `npm test`: 3 arquivos e 19 testes passando. São só fiscal/cálculo, auth/config e b2b/sessão.
- `npm audit --omit=dev`: **14 vulnerabilidades, sendo 3 críticas, 9 altas, 1 moderada e 1 baixa.**
  - As críticas estão em `next` (faixa "9.3.4-canary.0 - 16.3.0-preview.10": DoS e cache confusion em Server Actions/App Router), em `@auth/core <=0.41.2` e no `next-auth`, que depende dele.
  - As altas incluem `axios`, `zod <4.6.6` (via `openai`), `postcss`, `nanoid`, `form-data`, `follow-redirects` e `esbuild`.
- `npm run build` **não foi rodado**, por ordem de não sobrecarregar a máquina (5 agentes em paralelo). Fica pendente para o `erp-qa`.
- O app **não foi subido** localmente. As telas foram avaliadas por leitura de código.
- A varredura multi-tenant percorreu as 66 `route.ts`, as páginas (app)/b2b/m, `src/lib`, o SQL cru e os workers. Os 4 achados graves foram reconferidos à mão: `api/pix/recorrencia/route.ts:57-60`, `lib/nfe/nfse.ts:134-140` e `lib/ai/chat.ts:117-148`.

## Bloqueadores (grave → leve)

| # | Achado | Evidência | Impacto | Quem corrige | Esforço |
|---|---|---|---|---|---|
| 1 | **Vazamento entre empresas (IDOR) em 4 pontos graves.**<br>(a) Pix recorrente: pausar, retomar, cancelar e cobrar usam `idRec` do corpo, sem checar o dono, e a conta do PSP é global.<br>(b) NFS-e: `vendaId` do corpo marca a venda de outra empresa como FATURADA.<br>(c) MDF-e: encerra ou cancela por `chaveMdfe` de qualquer empresa.<br>(d) Chat de IA: `produto.findUnique({id})` sem `empresaId` mostra preço e estoque de outra loja, e `registrar_orcamento` aceita `clienteId` alheio. | (a) `src/app/api/pix/recorrencia/route.ts:57-62` e `src/lib/pagamentos/pix-recorrente.ts:87-130`<br>(b) `src/app/api/fiscal/nfse/route.ts:36-37` e `src/lib/nfe/nfse.ts:134-140`<br>(c) `src/app/api/fiscal/mdfe/route.ts:51-55` e `src/lib/nfe/mdfe.ts:110,134`<br>(d) `src/lib/ai/chat.ts:117-118,135-148` | Uma loja cliente vê ou altera dinheiro, nota e cliente de outra. É incidente de LGPD e quebra de contrato com a primeira e com a segunda loja. | `erp-backend` (com `erp-fiscal` em NFS-e/MDF-e, `erp-financeiro-contabil` no Pix e `erp-ia` no chat); revisão pelo `erp-revisor` | M |
| 2 | **IDOR médio e mistura de tenants.**<br>OS e RMA aceitam `clienteId`, `veiculoClienteId`, `tecnicoId`, `vendaId`, `produtoId` etc. do corpo sem validar a empresa. Depois emitem NFS-e com CPF/CNPJ do cliente alheio.<br>O inbound do WhatsApp vai sempre para a **primeira empresa do banco**, e `ConversaIA` não tem `empresaId`.<br>O webhook de marketplace grava o payload de qualquer tenant como `InsightIA` da primeira empresa. | OS: `src/lib/os/ordem-servico.ts:62-68,130`<br>RMA: `src/lib/rma/rma.ts:38-41,73-76,124-163`<br>WhatsApp: `src/app/api/ia/whatsapp/route.ts:50,58`<br>Marketplace: `src/app/api/webhooks/marketplaces/route.ts:56` | Com a segunda loja no ar, mensagens e pedidos de uma caem na outra. | `erp-backend`, `erp-integracoes` | M |
| 3 | **Não existe entrada de cliente pagante.**<br>Não há cadastro self-service, convite de usuário, troca ou "esqueci a senha", nem logout na ERP.<br>Empresa e admin só nascem por script (`railway run npx tsx scripts/nova-empresa.ts`).<br>Os dados da empresa são só leitura na tela. | `scripts/nova-empresa.ts:1-12`<br>`src/app/api/auth/` (só `2fa`, `login`, `logout`)<br>`src/app/(app)/configuracoes/page.tsx:53-61` (empresa só leitura, usuários só como número em :59)<br>`src/app/(auth)/` está vazio<br>`components/layout/sidebar.tsx:97-98` (rodapé fixo "Loja Demo / CNPJ 00.000.000/0001-00") | Cada loja e cada funcionário novo dependem do dono rodando um script em produção. Com várias lojas, não escala e gera erro. | `erp-backend` + `erp-frontend` + `erp-ux`; `erp-implantacao` define o roteiro | M |
| 4 | **Não existe cobrança da assinatura SaaS.**<br>Não há model de plano, assinatura ou inadimplência no schema. Também não há limite por plano nem bloqueio por falta de pagamento. | `grep` em `prisma/schema.prisma` e em `src` por assinatura/plano/billing/subscription/trial: só aparece `PlanoConta` (contábil) e o Pix Automático do **cliente da loja**, nada do SaaS | Sem cobrança automática, o dono cobra à mão e não tem como suspender quem não paga. | `erp-crescimento-receita` (planos e preço), `erp-backend`, `erp-financeiro-contabil` | M |
| 5 | **Não há base legal para vender.**<br>Faltam termos de uso, política de privacidade e contrato de operador de dados (DPA), que é obrigatório porque a loja é controladora e o SaaS é operador (LGPD art. 39).<br>Faltam também canal do titular, exportação e portabilidade dos dados da loja, exclusão e anonimização de cliente final, e plano de saída no cancelamento. | `grep -i "termos de uso\|política de privacidade\|lgpd\|encarregado"` em `src` e `docs`: zero resultado<br>Nenhuma rota de exportação ou exclusão em `src/app/api/clientes/`<br>`LogAuditoria` existe no schema (`prisma/schema.prisma:1813`), mas **nenhum código grava nele**: `grep logAuditoria src` dá zero | Vender sem contrato e sem DPA deixa o dono exposto em qualquer incidente. A regra do CLAUDE.md ("toda alteração de preço, estoque, desconto, cancelamento gera LogAuditoria") não é cumprida, e sem trilha não há defesa em disputa. | Advogado (externo) para os textos; `erp-backend` (exportação, exclusão, auditoria); `erp-produto` decide o escopo | M (código) + externo |
| 6 | **Configuração fiscal não é por loja.**<br>O token e o ambiente da Focus vêm de variável de ambiente global. A série está fixa em `"1"`. Não há tela nem campo de certificado A1, série, CSC da NFC-e nem regime editável. | `src/lib/nfe/emissor.ts:77,111,121`<br>`src/app/(app)/configuracoes/page.tsx:28`<br>`model Empresa` (`prisma/schema.prisma`) não tem campos de certificado ou série | Cada loja nova exige mexer no servidor e no painel da Focus à mão. Um erro de configuração vira nota com dado de outra empresa ou rejeitada. | `erp-fiscal` + `erp-backend` + `erp-frontend` (encosta na aposta 1) | M |
| 7 | **Metade das telas é vitrine** (detalhe na seção Telas).<br>Fiscal mostra o texto "POST /api/fiscal/operacoes" no lugar de botão. O dropzone de NF de Compras é falso. Faltam criar e editar em produtos (o link `/produtos/novo` dá 404), clientes, fornecedores, OS, RMA, comissões e financeiro. O PWA `/m` tem 6 links que dão 404 e fica sem checagem de sessão. | `src/app/(app)/fiscal/page.tsx:29-95,137`<br>`src/app/(app)/compras/page.tsx:50`<br>`src/app/(app)/produtos/page.tsx:31`<br>`src/app/m/page.tsx:5-10` e `src/app/m/layout.tsx:30-34`<br>`src/app/(app)/os/page.tsx:90`<br>`src/app/(app)/comissoes/page.tsx:79` | Em demonstração, o cliente percebe em minutos. Na operação real, a loja não consegue emitir, cancelar nem cadastrar pela tela. | `erp-frontend` + `erp-ux` (+ `erp-design`) | G |
| 8 | **Promessas falsas no README e na página inicial** (lista completa na seção Promessas). | `README.md:5,26-67,91,100`<br>`src/app/page.tsx:24,29,61,85`<br>`docs/COMPARATIVO-CONCORRENTES.md:16-17,24,27` | Vender o que não existe é risco jurídico (CDC, publicidade enganosa) e de reputação. | `erp-produto` + `erp-crescimento-receita`; conferência pelo `erp-revisor` | P |
| 9 | **Dependências com vulnerabilidade crítica** (`next`, `@auth/core`) e falhas de RBAC nas páginas.<br>ESTOQUISTA e CAIXA abrem financeiro, contábil, fiscal, comissões e configurações, porque o layout só exige login.<br>O rate limit do login é em memória e confia em `x-forwarded-for`.<br>Desligar o 2FA não pede código. | `npm audit --omit=dev` (saída acima)<br>`src/app/(app)/layout.tsx:7-8`<br>`src/lib/auth/rate-limit.ts:3-5` e `src/app/api/auth/login/route.ts:19`<br>`src/app/api/auth/2fa/route.ts:31` | Funcionário vê dado financeiro que não devia (LGPD). O limite de tentativas de login é contornável. | `erp-backend` (o rate limit em Redis está na aposta 3) | P–M |
| 10 | **Operação SaaS sem rede de segurança.**<br>Não há monitoramento ou alerta de erro (nenhum Sentry, logger estruturado ou CI). Não há backup fora do Railway: o `pg_dump` está só planejado na aposta 3. Não se sabe se existe serviço de worker no Railway. Não há canal de suporte nem base de ajuda. | `package.json` (nenhuma lib de monitoramento)<br>`.github/workflows` não existe<br>`railway.toml` (só app web, `restartPolicyMaxRetries = 5`)<br>`/api/health` só faz `SELECT 1` (`src/app/api/health/route.ts:9`) | Se o banco cair ou um job parar, ninguém fica sabendo, e a perda de dados de uma loja pode ser irreversível. | `erp-backend` (+ `erp-qa` para CI) | M |
| 11 | **A busca não aguenta 50 mil produtos.**<br>A extensão `pg_trgm` está ligada, mas **não há índice GIN de trigram**. A busca roda `similarity(unaccent(lower(nome \|\| marca)))` sobre todas as linhas e o `contains` com `mode: insensitive`. Há índices só por código, OEM e EAN. | `prisma/migrations/0_init/migration.sql:2`<br>`src/lib/catalogo/busca.ts:65,97-105,124`<br>índices do model `Produto`: `@@index([empresaId, codigoBarras/codigoFabricante/codigoOem/ativo])` | É hipótese, porque não foi medido: com o catálogo de uma loja média, a busca de balcão por nome tende a ficar lenta, e o balcão é onde o produto vence ou perde. | `erp-backend` (medir com seed de 50 mil e criar índice GIN numa migração nova) | P |
| 12 | **Testes cobrem quase nada do que dá multa ou perde dinheiro.**<br>Há 19 testes: cálculo fiscal, config de auth e sessão B2B. Não há teste de emissor, SPED, custo médio, caixa, crediário, contas, multi-tenant ou RBAC. | `find src -name "*.test.ts"`: 3 arquivos, 157 linhas | Cada correção pode quebrar outra coisa sem ninguém perceber. Pela regra do projeto, fiscal e financeiro exigem teste de valor. | `erp-qa` + donos de cada área | M–G |

Achados leves que não bloqueiam, mas entram na fila:
- Catálogo global (montadora, modelo, marca) é gravável por GERENTE de qualquer loja (`src/lib/catalogo/tecdoc.ts:89-117`).
- `PlanoConta` é global (`src/lib/contabil/lancamentos.ts:93`).
- `notaEntrada.chaveAcesso` é único global, então uma loja bloqueia o import da outra (`src/lib/nfe/importar-xml.ts:64`).
- Conciliação aceita `contaBancariaId` alheio (`src/app/api/financeiro/conciliar/route.ts:10,18`).
- `pushSubscription.upsert` por endpoint sem checar o dono (`src/app/api/notificacoes/route.ts:41`).
- A chave da API de placa vai na URL (`src/lib/catalogo/placa.ts:33`), já na aposta 3.

## Detalhe por pergunta

### 1. Jornada do cliente pagante
| Etapa | Situação | Evidência |
|---|---|---|
| Cadastro da loja | Só por script, não existe self-service | `scripts/nova-empresa.ts` |
| Primeiro login | Funciona. Senha gerada e impressa uma vez no terminal; tem 2FA opcional | `src/app/login/page.tsx`, `scripts/nova-empresa.ts:48` |
| Convite de usuários | Não existe | `configuracoes/page.tsx:59` |
| Trocar ou recuperar senha, logout | Não existe tela. `/api/auth/logout` existe, mas nenhum botão chama | `sidebar.tsx`, `src/app/api/auth/` |
| Configuração fiscal (certificado, regime, série, CSC) | Não existe na tela. Token Focus global por env, série fixa "1" | Bloqueador 6 |
| Onboarding / implantação | Não existe na tela. Importador em construção (aposta 4) | — |
| Cobrança da assinatura, planos, limites, bloqueio | Não existe | Bloqueador 4 |
| Cancelamento e exportação dos dados | Não existe | Bloqueador 5 |

### 2. Legal e LGPD
- Faltam termos de uso, política de privacidade, DPA, aviso e consentimento no portal B2B e no WhatsApp, encarregado (DPO) e canal do titular. A busca não acha nenhum desses itens.
- Faltam exclusão, anonimização e portabilidade de cliente final.
- `LogAuditoria` nunca é gravado.
- Logs: não foram encontrados `console.*` com CPF, CNPJ, e-mail ou telefone (grep). O inbound do WhatsApp, porém, grava a conversa sem empresa (`ConversaIA` sem `empresaId`).
- Perfil: páginas de financeiro e contábil abertas para CAIXA e ESTOQUISTA (bloqueador 9).

### 3. Multi-tenant
- São 66 `route.ts`. Em 54, todos os métodos usam `comAuth`. Nas outras 12, a exceção é legítima:
  - públicas: login, logout e health, também no B2B;
  - 2FA, que usa a sessão manual;
  - webhooks com token ou HMAC;
  - Vallente, por API key da empresa.
- Nenhuma rota tira `empresaId` do corpo. O SQL cru é parametrizado e usa aspas. Os workers rodam empresa por empresa.
- As falhas são de outro tipo: **ids estrangeiros aceitos do corpo**. Veja os bloqueadores 1 e 2 e os achados leves.
- B2B: o escopo por `clienteId` da sessão está correto. A exceção é o orçamento criado com `clienteId` alheio pelo chat de IA.

### 4. Telas (nota 0 a 3)
Escala: 0 = placeholder ou quebrada, 1 = parcial, 2 = funciona com falhas, 3 = sólida.

| Tela | Nota | Principal problema |
|---|---|---|
| Página inicial `/` | 1 | Só marketing, com "97%+ de precisão" sem prova e "IA Claude" (o código usa OpenAI). Não tem preço nem cadastro |
| Layout e menu | 1 | Rodapé "Loja Demo / CNPJ 00.000.000/0001-00" fixo e sem logout. O item `/m` fica aceso em `/marketplaces` (`sidebar.tsx:74`) |
| Login | 3 | Falta "esqueci a senha" |
| `(auth)/` | 0 | Diretório vazio |
| Dashboard | 2 | Dados reais, sem tratamento de erro (não existe nenhum `error.tsx` no app) |
| PDV | 2 | Tem atalhos F2, F3, F6, F9 e ESC. Mas F4 "Foto IA" e a câmera não fazem nada (`pdv-client.tsx:53,328`). Cliente, placa e desconto usam `prompt()`/`alert()`. O desconto do F6 não passa no MarginGuard. O pagamento não chama TEF nem gera Pix. O cupom é `window.print()` |
| Caixa | 3 | Funciona, com fechamento cego |
| Produtos | 1 | Só lista. "Novo produto" dá 404, não tem busca nem edição, e a lista vazia diz "Rode o seed" |
| Estoque, transferência, inventário | 3 | Funcionam |
| Compras | 0 | O botão "Selecionar arquivo" da NF não faz nada (`compras/page.tsx:50`) |
| Compras / sugestão | 3 | Funciona |
| Fornecedores, Clientes, Veículos | 1 | Só leitura. Veículos diz "rode o seed" |
| Financeiro | 1 | Só leitura, sem baixa e sem conciliação na tela. Mostra o valor total, não o saldo restante (`financeiro/page.tsx:56`) |
| Fiscal | 0 | Mostra endpoints em vez de botões para emitir, cancelar, CC-e ou inutilizar |
| Contábil | 2 | Relatórios reais, mas uma falha aparece como zeros. O plano de contas é estático |
| Marketplaces | 1 | Sem conectar conta, sem sincronizar e sem responder. "Último sync" |
| OS, RMA, Comissões | 0–1 | Só leitura. O estado vazio manda usar "POST /api/…" |
| Relatórios | 2 | Sem filtro de período e sem exportar |
| IA | 1 | Mostra endpoints. "Rodar StockPredict" chama GET sem `produtoId` e recebe 400 |
| Hardware | 0 | Texto estático com caminhos de código-fonte |
| Configurações | 1 | Só leitura. A única ação real é gerar a chave Vallente |
| B2B login, pedidos, faturas, home | 2–3 | Funcionam. Faltam `/b2b/pedidos/[id]` (404) e o link de pagamento da fatura |
| B2B catálogo e garagem | 1 | "Adicionar" não faz nada, e não há carrinho nem pedido |
| `/m` (PWA) | 0 | 6 destinos com 404, sem sessão, "Olá, vendedor" fixo |
| `/m/scanner` | 1 | "Adicionar ao orçamento" só mostra um `alert` (é falso) e não trata erro |

### 5. Operação SaaS
- **Health:** existe e checa o banco. Não checa Redis nem a Focus.
- **Monitoramento, alertas e logs estruturados:** não existem.
- **CI:** não existe (`.github/workflows` ausente).
- **Backups:** só o backup de volume do Railway, se o plano tiver. O `pg_dump` externo está planejado na aposta 3.
- **Worker:** é processo separado (`npm run worker`) e exige `REDIS_URL`. O `railway.toml` só descreve o app web. Confirmar no Railway.
- **Railway:** a conta está ativa (o Radar publicou em 04/11/2026). Falta conferir se o projeto do ERP tem serviço de worker, backups e variáveis.
- **Variáveis de ambiente:**
  - Nenhuma derruba o boot de forma explícita.
  - As que faltam falham em silêncio: `OPENAI_API_KEY ?? ""` em `src/lib/ai/client.ts:13` e `FOCUS_NFE_TOKEN ?? ""` em `emissor.ts:111`. É pior, porque o erro só aparece na hora de emitir.
  - Falta validar as obrigatórias no start.
- **Desempenho:** busca sem índice trigram (bloqueador 11). Não foi medido.
- **Suporte:** não há canal, base de ajuda nem tela de ajuda no app.

### 6. Promessas falsas a corrigir antes de mostrar a cliente
| Onde | Promessa | Realidade |
|---|---|---|
| `README.md:67` | "Todo ✅ é código real, não promessa" | Vários ✅ não têm tela ou não funcionam (abaixo) |
| `README.md:31` | NF-e/NFC-e "✅ completo" com cancelamento, CC-e e inutilização | Não há tela para nenhuma dessas operações. O emissor manda PIS/COFINS fixo e não tem IBS/CBS (aposta 1) |
| `README.md:37-39` | SPED "✅ exporta TXT oficial" | A auditoria de jul/2026 registra que o arquivo não passa no PVA. Confirmar antes de manter |
| `README.md:46` | SAT "✅" | O SAT acabou em SP em 01/01/2026 (`docs/estrategia.md`) |
| `README.md:26-30` | ML "completo", Shopee, Amazon e Magalu "funcional", WhatsApp "in/out" | ML para em 1.000 anúncios (aposta 7). O WhatsApp manda tudo para a primeira empresa |
| `README.md:55` | App nativo "✅ pronto" | Só existe `capacitor.config.ts`, sem Capacitor no `package.json` |
| `README.md:54` | PWA `/m` "✅" | 6 das 7 telas não existem |
| `README.md:57` | Portal B2B com pedidos | O catálogo não permite fazer pedido |
| `README.md:91` e `src/app/page.tsx:24` | OCR "97%+ de precisão" | Nenhuma medição no repositório. Remover ou medir |
| `src/app/page.tsx:61` | "IA Claude no núcleo" | O código usa OpenAI (`src/lib/ai/client.ts`) |
| `src/app/page.tsx:29` | Busca "por voz" | Não existe código de voz (grep `SpeechRecognition` vazio). O comparativo diz "roadmap" |
| `src/app/page.tsx:29` | "MarginGuard impede queima" | O desconto F6 do PDV não passa pelo MarginGuard |
| `src/app/page.tsx:85`, `README.md:100` e `COMPARATIVO-CONCORRENTES.md` | "Diferenciais que ninguém mais tem" / "nenhum concorrente brasileiro tem" | Sem pesquisa que sustente. O próprio `mercado.md` diz que os ERPs de autopeças não publicam suas funções |
| `COMPARATIVO-CONCORRENTES.md:16` | Busca vetorial "✅ pgvector" | O pgvector está desativado no schema (`prisma/schema.prisma:19-21,447`) |

### 7. Qualidade
- tsc passa e os 19 testes passam. O build não foi rodado nesta auditoria.
- Cobertura por área crítica:
  - cálculo fiscal: 1 arquivo;
  - auth e B2B: 2 arquivos;
  - **nenhum teste** de emissor NF-e, SPED, custo médio, caixa, crediário, contas a pagar e receber, conciliação, estoque e kardex, isolamento entre empresas ou RBAC.
- `npm audit --omit=dev`: 14 vulnerabilidades (3 críticas, 9 altas, 1 moderada, 1 baixa). Parte sai com `npm audit fix`. O `zod`/`openai` pede atualização com quebra.

## Para vender em 30 dias, nesta ordem

1. **Fechar os vazamentos entre empresas** (bloqueadores 1 e 2): validar todo id estrangeiro vindo do corpo contra `empresaId` e amarrar WhatsApp e webhooks à empresa certa. Junto, escrever um teste automático "loja A não enxerga nem altera loja B" para cada rota corrigida. Responsáveis: `erp-backend` e `erp-qa`, com `erp-revisor` dando OK.
2. **Atualizar as dependências críticas** (`next`, `@auth/core`) e travar as páginas por perfil (bloqueador 9). Responsáveis: `erp-backend` e `erp-qa`.
3. **Corrigir README, página inicial e comparativo**: tirar todo ✅ e "ninguém tem" sem prova, e marcar o resto como "em construção" (bloqueador 8). Responsáveis: `erp-produto` e `erp-crescimento-receita`. É o mais barato e evita o maior risco jurídico.
4. **Resolver a hospedagem**: plano pago no Railway (ou outro), serviço de worker confirmado, `pg_dump` externo com teste de restauração e alerta de erro e de queda (bloqueador 10). Responsável: `erp-backend`. 
5. **Contrato**: termos de uso, política de privacidade e DPA revisados por advogado. No código, exportação dos dados da loja e gravação do `LogAuditoria` em preço, estoque, desconto, cancelamento e estorno (bloqueador 5). Responsáveis: o dono, um advogado, `erp-backend` e `erp-produto`.
6. **Configuração por loja**: certificado, série, CSC, regime e ambiente por empresa, com tela de configuração fiscal. Também convite de usuário, troca de senha e logout (bloqueadores 3 e 6). Responsáveis: `erp-fiscal`, `erp-backend`, `erp-frontend` e `erp-ux`.
7. **Telas mínimas para a loja operar sozinha** (bloqueador 7), nesta ordem:
   - emitir, cancelar e CC-e na tela fiscal;
   - cadastrar e editar produto e cliente;
   - entrada de NF (XML) em Compras;
   - baixa no financeiro.
   
   Esconder do menu o que não estiver pronto: hardware, `/m`, IA e marketplaces sem ação. Responsáveis: `erp-frontend`, `erp-ux` e `erp-design`.
8. **Índice trigram e teste de carga com 50 mil produtos** (bloqueador 11). Responsáveis: `erp-backend` e `erp-qa`.
9. **Cobrança simples da assinatura**: plano único, boleto ou Pix recorrente via PSP e bloqueio após X dias de atraso, com o prazo decidido pelo dono (bloqueador 4). Responsáveis: `erp-crescimento-receita` (preço) e `erp-backend`. Até aqui, a loja piloto pode ser cobrada à mão.
10. **Testes de valor** em custo médio, caixa, contas e emissor, e um CI que rode tsc, testes e build a cada push (bloqueador 12). Responsáveis: `erp-qa` com os donos das áreas.

Os itens 1 a 5 são condição para cobrar de **qualquer** loja, inclusive a piloto. Os itens 6 a 10 são condição para vender para a segunda loja sem o dono implantar à mão.

## O que ficou pendente
- `npm run build`: não rodado (ordem de não sobrecarregar a máquina).
- Teste no navegador e medição de desempenho da busca: não feitos. O bloqueador 11 é hipótese até ser medido.
- Situação real do Railway: plano, worker, backups e variáveis. Exige acesso do dono.
- Conferir no PVA se o SPED atual ainda é rejeitado (a afirmação vem da auditoria de jul/2026).
