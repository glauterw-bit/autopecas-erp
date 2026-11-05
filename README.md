# AutoPeças ERP

ERP para lojas de autopeças em desenvolvimento: balcão/PDV, estoque, compras, fiscal (NF-e/NFC-e via Focus NFe), financeiro, catálogo veicular, integrações com marketplaces e recursos de IA (OpenAI) que **sugerem** e deixam a pessoa confirmar.

> **Estado em 04/11/2026:** nenhuma loja opera no sistema ainda. Boa parte das funções existe como código (biblioteca e API) e ainda não tem tela, teste com conta real ou validação oficial. A tabela abaixo diz o que já funciona e o que falta. Ganhos de tempo, precisão ou venda serão **medidos na loja piloto**; não há números de resultado até lá. Detalhes em `docs/AUDITORIA-2026-11-VENDA.md`.

---

## Sumário

1. [Pesquisa de mercado e concorrentes](#1-pesquisa-de-mercado)
2. [Recursos de IA e o que os diferencia](#2-recursos)
3. [Stack técnica](#3-stack)
4. [Arquitetura](#4-arquitetura)
5. [Módulos do sistema](#5-módulos)
6. [Recursos de IA](#6-recursos-de-ia)
7. [Como rodar](#7-como-rodar)
8. [Roadmap](#8-roadmap)

---

## Matriz de cobertura (estado real do código)

Legenda:
- ✅ **funciona**: código e tela prontos para uso (ainda sem loja real operando).
- 🟡 **beta**: o código existe, mas falta tela, teste com conta ou equipamento real, ou parte da função. A coluna "Falta" diz o quê.
- 🚧 **em desenvolvimento**: só a base existe.

| Área | Status | O que existe | Falta |
|---|---|---|---|
| **Mercado Livre** | 🟡 beta | sync de anúncios e pedidos, publicar anúncio, compatibilidade de autopeças, perguntas (`src/lib/marketplaces/mercado-livre.ts`) | sync para em 1.000 anúncios (`MAX_PAGINAS = 20` × 50, linha 25); não testado com conta real |
| **Shopee** | 🟡 beta | sync de anúncios e pedidos, webhook com HMAC (`src/lib/marketplaces/shopee.ts`) | teste com conta real |
| **Amazon SP-API** | 🟡 beta | LWA OAuth, Listings e Orders (`src/lib/marketplaces/amazon.ts`) | teste com conta real |
| **Magalu** | 🟡 beta | adaptador de anúncios, pedidos, preço e estoque (`src/lib/marketplaces/magalu.ts`) | envio de mensagem não implementado (`magalu.ts:157`); teste com conta real |
| **WhatsApp Business** | 🚧 em desenvolvimento | webhook de entrada e envio via Graph API (`src/lib/marketplaces/whatsapp.ts`) | a entrada vai sempre para a primeira empresa do banco (`src/app/api/ia/whatsapp/route.ts:50`); não serve para mais de uma loja |
| **NF-e 55 / NFC-e 65** | 🟡 beta | emissão ao faturar a venda (`src/app/api/vendas/[id]/faturar/route.ts`), cancelamento, CC-e, inutilização e manifestação via API (`src/lib/nfe/operacoes.ts`) | tela para cancelar, CC-e e inutilizar (a tela fiscal só mostra o endereço da API); configuração fiscal por loja; IBS/CBS; emitir só em homologação até validar |
| **NFS-e municipal** | 🟡 beta | padrão ABRASF via API (`src/lib/nfe/nfse.ts`) | tela; teste com prefeitura |
| **MDF-e** | 🟡 beta | emissão, encerramento e cancelamento via API (`src/lib/nfe/mdfe.ts`) | tela; teste em homologação |
| **CT-e** | 🟡 beta | emissão e importação via API (`src/lib/nfe/cte.ts`) | tela; teste em homologação |
| **Motor fiscal** | 🟡 beta | ICMS, ICMS-ST com MVA ajustada, DIFAL + FCP, IPI, PIS/COFINS (`src/lib/fiscal/calculo.ts`, com testes) | o emissor ainda manda PIS/COFINS fixo; IBS/CBS |
| **PGDAS-D (Simples)** | 🟡 beta | cálculo da alíquota efetiva e do DAS (`src/lib/fiscal/simples-nacional.ts`) | conferência com um contador; não transmite |
| **SPED ECD, EFD-ICMS/IPI e Contribuições** | 🟡 beta | gera o arquivo TXT (`src/lib/contabil/sped.ts`, `sped-contribuicoes.ts`) | **ainda não validado no PVA da Receita**; não usar para entrega oficial até passar no PVA |
| **DCTFWeb / DEFIS / EFD-Reinf** | 🚧 em desenvolvimento | cálculo interno (`src/lib/fiscal/declaracoes.ts`) | não gera arquivo transmissível |
| **DRE, balanço, DFC, DLPA, razão** | 🟡 beta | relatórios a partir dos lançamentos (`src/lib/contabil/`) | conferência com um contador |
| **TEF / PinPad** | 🟡 beta | cliente do agente local na porta 60906 (`src/lib/pdv/tef.ts`, `agente-pdv/`) | teste com adquirente e PinPad reais |
| **SAT-CF-e** | — não se aplica a SP | cliente existe (`src/lib/pdv/sat.ts`) | **o SAT acabou em SP em 01/01/2026** (Portaria SRE 79/2024); em SP o balcão usa NFC-e |
| **Impressora ESC/POS** | 🟡 beta | montagem do cupom com QR Code e gaveta (`src/lib/pdv/impressora.ts`) | teste com impressora real |
| **Leitor de código de barras** | ✅ | leitor USB (teclado) no PDV, sem driver | — |
| **Balança** | 🟡 beta | parsers Toledo, Filizola e Urano (`src/lib/pdv/balanca.ts`) | teste com balança real |
| **Pix dinâmico** | 🟡 beta | BR Code com CRC16 e cliente de PSP (`src/lib/pagamentos/pix.ts`) | teste com conta de PSP real |
| **Pix Automático** | 🚧 em desenvolvimento | criar, pausar, retomar e cancelar via API (`src/lib/pagamentos/pix-recorrente.ts`) | corrigir a checagem de dono por empresa (auditoria, bloqueador 1); teste com PSP |
| **TecDoc (CSV e XML) + sync mensal** | 🟡 beta | importadores e job mensal (`src/lib/catalogo/tecdoc*.ts`) | licença e arquivo TecDoc reais |
| **RMA / devolução / garantia** | 🟡 beta | fluxo via API (`src/lib/rma/rma.ts`) | tela para abrir e mover o RMA |
| **Ordem de serviço** | 🟡 beta | fluxo via API (`src/lib/os/ordem-servico.ts`) | tela para criar a OS |
| **Comissões** | 🟡 beta | regras por venda, margem, faixa e fixo (`src/lib/comissao/calculo.ts`) | tela para editar regras |
| **Conciliação OFX** | 🟡 beta | parser OFX e matcher (`src/lib/financeiro/`) | tela de importação; teste com extratos reais |
| **Entrada por XML de NF-e** | 🟡 beta | importação idempotente por chave (`src/lib/nfe/importar-xml.ts`) | tela em Compras |
| **PWA do vendedor externo** | 🚧 em desenvolvimento | `/m` com scanner por câmera (`src/components/mobile/scanner-client.tsx`) e service worker (`public/sw.js`) | 5 das 6 telas do menu de `/m` ainda não existem (`src/app/m/page.tsx:6-10`) |
| **App nativo iOS/Android** | 🚧 em desenvolvimento | só o arquivo `capacitor.config.ts` | Capacitor não está instalado no `package.json`; não há app publicado |
| **Portal B2B (oficinas)** | 🟡 beta | `/b2b` com login, catálogo com tabela de preço, garagem, histórico de pedidos e faturas | a oficina ainda não consegue fazer pedido pelo catálogo |
| **Workers BullMQ + Redis** | 🟡 beta | sync de marketplaces a cada 15 min, StockPredict diário às 3h, MarginGuard diário às 4h, TecDoc mensal (`src/workers/index.ts`) | confirmar o serviço de worker no Railway |
| **Login (PBKDF2 + 2FA TOTP)** | ✅ | senha com hash, 2FA por app autenticador, sessão httpOnly, perfis hierárquicos (`src/lib/auth/`) | convite de usuário, troca de senha e trava de páginas por perfil (auditoria, bloqueadores 3 e 9) |
| **Push** | 🟡 beta | Web Push VAPID, APNs e FCM (`src/lib/notificacoes/push.ts`) | teste em aparelho real |

> Esta tabela segue a auditoria de 04/11/2026 (`docs/AUDITORIA-2026-11-VENDA.md`). Ao mudar o estado de uma linha, cite o arquivo que comprova.

## 1. Pesquisa de mercado

### Principais concorrentes no Brasil (2026)

Os ERPs de autopeças quase não publicam suas funções e preços (`docs/conhecimento/mercado.md`). A coluna abaixo é **hipótese** a partir dos sites públicos, não uma comparação testada.

| Sistema | Foco | Onde achamos que dá para fazer melhor (hipótese) |
|---|---|---|
| **Linx** | Varejo geral, módulo autopeças | IA aplicada ao balcão |
| **Lexos** | Autopeças, omnichannel | cross-reference e identificação por foto |
| **vhsys** | PME genérico | aplicação veicular e catálogo TecDoc |
| **SOFTClass (ERPClass)** | Autopeças | IA e marketplaces sem hub terceiro |
| **Bling / Tiny** | PME e e-commerce | compatibilidade de autopeças no ML |
| **TECNICON** | Indústria + autopeças | experiência de uso no balcão |
| **Omie** | PME geral | conhecimento do nicho |
| **WinPro / ZionSoft / ERPPro** | PDV autopeças | painéis e IA |

### Padrões do mercado (são pré-requisito, não diferencial)

- Busca por **aplicação veicular** (montadora/modelo/ano), estrutura TecDoc/Cinoa.
- **Cadastro por código OEM, fabricante, original** e código de barras.
- Emissão de **NF-e (modelo 55) e NFC-e (65)**. O SAT acabou em SP em 01/01/2026.
- **Integração com marketplaces** (Mercado Livre, Shopee, Amazon, Magalu).
- Compatibilidade de autopeças no Mercado Livre (universal / catálogo / atributos).
- **Leitura de NF-e de entrada** (XML e, em alguns, OCR).
- **Curva ABC** e ponto de reposição.
- **Multi-loja / multi-depósito**.
- Pagamento parcelado, crediário, conciliação.

---

## 2. Recursos

Os recursos abaixo são o que queremos que diferencie o AutoPeças ERP. Não temos pesquisa que prove que nenhum concorrente os tenha, então não dizemos isso. Todos estão em **beta ou em desenvolvimento**: a IA sugere e a pessoa confirma, e a precisão de cada um será medida na loja piloto.

### 2.1 AutoVision — identificação de peça por foto (🚧 em desenvolvimento)
A pessoa envia a foto da peça e a IA (OpenAI) sugere categoria, códigos OEM e de fabricante legíveis e marca, e procura SKUs equivalentes. O balconista confirma.

Falta: o botão de câmera do PDV ainda não está ligado (`src/components/pdv/pdv-client.tsx:328`) e a precisão não foi medida.

> Implementação: `src/lib/ai/vision.ts` + `POST /api/ia/vision`

### 2.2 NF-IA — leitura de DANFE por IA (🚧 em desenvolvimento)
PDF ou imagem da NF de entrada → dados estruturados (cabeçalho, chave, totais, itens com NCM, CFOP, IPI, quantidade e custo) para a pessoa conferir antes de virar entrada.

Falta: a área de envio na tela de Compras ainda não funciona (`src/app/(app)/compras/page.tsx`); sugestão de preço de venda não está implementada; precisão a medir na loja piloto. Para entrada de nota, o caminho seguro é o XML (`src/lib/nfe/importar-xml.ts`).

> Implementação: `src/lib/ai/ocr-nf.ts` + `POST /api/ia/ocr-nf`

### 2.3 StockPredict — previsão de reposição (🟡 beta)
Calcula a partir do histórico de vendas (suavização exponencial) dias de cobertura, ponto de reposição e quantidade sugerida considerando o prazo do fornecedor. A IA (OpenAI) comenta fatores sazonais em texto; **não há dado de clima real**, só o conhecimento geral do modelo. Gera `InsightIA(RUPTURA_PREDITIVA)` para curva A e B. A compra é sempre decisão humana.

Falta: medir o acerto da previsão na loja piloto.

> Implementação: `src/lib/ai/prediction.ts` + `POST /api/ia/prever-demanda`

### 2.4 SmartCross — sugestão de peça equivalente (🚧 em desenvolvimento)
Hoje só via API, sem tela. Toda equivalência sugerida pela IA precisa de confirmação humana. 3 estratégias em cascata:
1. Match exato de códigos OEM/fabricante/EAN.
2. Aplicação veicular comum.
3. Re-ranking semântico via OpenAI com julgamento técnico (EQUIVALENTE / SIMILAR / SUBSTITUTO / KIT_ALTERNATIVO).

Persiste como grafo direcionado em `CrossReference` com `confianca` e `fonte`.

> Implementação: `src/lib/ai/cross-reference.ts` + `POST /api/ia/cross-reference`

### 2.5 Trava de desconto e MarginGuard (🟡 beta)
Ao gravar a venda (`src/app/api/vendas/route.ts`):
- bloqueia preço abaixo do `precoMinimo` e desconto total acima do limite do perfil (`src/lib/vendas/politica-desconto.ts`);
- o MarginGuard **marca** (não bloqueia) `margemAbaixoMinimo` no item, mas olha o preço unitário, sem o desconto do item nem o desconto geral (F6).

Em lote diário, lista produtos vendidos abaixo da margem nos últimos 30 dias.

> Implementação: `src/lib/ai/margin-guard.ts`

### 2.6 Copiloto de balcão — chat com ferramentas (🚧 em desenvolvimento)
Chat com ferramentas (`buscar_peca`, `verificar_disponibilidade`, `registrar_orcamento`) que consultam o banco da loja. Preço e estoque vêm do banco, nunca da IA.

Falta: tela de chat; corrigir o isolamento entre empresas nas ferramentas (auditoria, bloqueador 1); ligar ao WhatsApp com a empresa certa.

> Implementação: `src/lib/ai/chat.ts` + `POST /api/ia/chat`

### 2.7 Busca por placa (🟡 beta)
No PDV, a placa consulta um provedor pago (WDAPI, precisa de `PLACA_API_KEY`) e mostra marca, modelo e ano.

Falta: filtrar as peças compatíveis com o veículo. A busca por aplicação existe (`src/lib/catalogo/busca.ts:59`), mas o PDV ainda não passa a versão do veículo para ela.

> Implementação: `src/lib/catalogo/placa.ts` + `GET /api/veiculos/buscar-placa`

### 2.8 Marketplaces numa interface única + compatibilidade no ML (🟡 beta)
Adaptadores com a mesma interface (`AdaptadorMarketplace`) para ML, Shopee, Amazon e Magalu. Envia a aplicação veicular do ERP para a compatibilidade de autopeças do Mercado Livre. Não testado com conta real; o sync do ML para em 1.000 anúncios.

> Implementação: `src/lib/marketplaces/{mercado-livre,shopee,unified}.ts`

### 2.9 OmniInbox — caixa única de mensagens (🚧 em desenvolvimento)
Mensagens de marketplace ficam em `MensagemMarketplace` com um `rascunhoIA` que o atendente revisa. A IA não responde sozinha.

Falta: responder pela tela (hoje a tela de Marketplaces só lista as mensagens). O ganho de tempo de resposta será medido na loja piloto.

### 2.10 Catálogo veicular (Montadora → Modelo → Versão → Aplicação) (✅ estrutura; 🟡 importação)
Estrutura no padrão TecDoc, com `PosicaoMontagem` (dianteira/traseira/lado), motorização, combustível, ano início/fim. A importação TecDoc depende de licença e arquivo reais.

### 2.11 Insights de IA com retorno da pessoa (🟡 beta)
Saídas de IA viram `InsightIA` com `severidade`, `acaoSugerida`, `dadosReferencia` e `feedback` (UTIL/NAO_UTIL/INCORRETO), para medir o que serve.

### 2.12 Multi-empresa e auditoria (🚧 em desenvolvimento)
O schema é multi-empresa (`empresaId` nas entidades transacionais) e tem perfis hierárquicos (ADMIN, GERENTE, FINANCEIRO, VENDEDOR, CAIXA, ESTOQUISTA, TECNICO).

Falta: fechar os vazamentos entre empresas apontados na auditoria (bloqueadores 1 e 2) e gravar o `LogAuditoria`, que existe no schema mas ainda não é escrito por nenhum código.

---

## 3. Stack

- **Next.js 15** (App Router, React 19)
- **TypeScript** estrito
- **PostgreSQL 16** com extensões `pg_trgm` e `unaccent` (o `pgvector` está desligado no schema, `prisma/schema.prisma:19-21`)
- **Prisma 5** como ORM
- **Tailwind CSS** + shadcn/ui-style primitives
- **OpenAI SDK** — GPT-4o (visão, OCR, raciocínio estruturado) e GPT-4o-mini (alta-frequência baixa-latência)
- **BullMQ + Redis** para filas (sync de marketplaces, OCR em lote, geração de insights noturnos)
- **Zod** para validação
- **TanStack Query** + **Zustand** no front
- **Recharts** para gráficos
- Autenticação própria (PBKDF2 + TOTP, sessão httpOnly) em `src/lib/auth/`
- Emissão fiscal via **Focus NFe** (substituível por Webmania/eNotas)

### Modelos de IA — estratégia de custo

| Tarefa | Modelo | Razão |
|---|---|---|
| Análise gerencial, planejamento de compras, raciocínio multi-passo | gpt-4o | Vision multimodal, raciocínio sólido, JSON mode |
| AutoVision, NF-IA, SmartCross | gpt-4o | Visão excelente, structured outputs, function calling |
| Chat de balcão, explicações curtas, autocomplete | gpt-4o-mini | Latência e custo menores |

Prompt caching da OpenAI é automático para prompts ≥ 1024 tokens repetidos — não precisa marcar manualmente. Para trocar o modelo (gpt-5, o3, etc.), edite só `src/lib/ai/client.ts`.

---

## 4. Arquitetura

```
┌──────────────────────────────────────────────────────────────────┐
│                          Next.js 15 (App)                        │
│  Páginas (/dashboard, /pdv, /produtos, /financeiro, /ia, ...)    │
│  APIs        (/api/produtos, /api/vendas, /api/ia/*, ...)        │
└─────────────┬────────────────────────────────────────────────────┘
              │
              ├──► lib/ai/*      → OpenAI (gpt-4o, gpt-4o-mini)
              ├──► lib/marketplaces/* → ML, Shopee, Amazon (OAuth)
              ├──► lib/nfe/*     → Focus NFe (NF-e/NFC-e)
              ├──► lib/catalogo/* → consulta placa, TecDoc, busca PDV
              └──► lib/db.ts    → Prisma → PostgreSQL
                                          (multi-tenant por empresaId)

Workers (BullMQ + Redis)
   • sync-marketplaces (15 min)
   • stockpredict-batch (diário, 3h)
   • margin-guard-batch (diário, 4h)
   • tecdoc-cron (mensal)
```

### Modelo de dados — destaques

O schema (`prisma/schema.prisma`) tem 40+ models cobrindo:

- **Multi-tenant**: `Empresa` → `Filial` → `Deposito` → `Caixa`.
- **Catálogo veicular**: `Montadora` → `ModeloVeiculo` → `VersaoVeiculo` → `AplicacaoVeicular` ← `Produto`.
- **Produto**: 40+ campos incluindo fiscal (NCM, CFOP, CST, alíquotas), físico (peso/dimensões), preço por canal, curva ABC, lead time. O campo de embedding vetorial está comentado até o pgvector ser ligado.
- **Cross-reference**: grafo direcionado entre produtos com tipo (EQUIVALENTE/SIMILAR/SUBSTITUTO/KIT_ALTERNATIVO), confiança e fonte.
- **Venda**: tipo (VENDA/ORCAMENTO/DEVOLUCAO/TROCA), origem (BALCAO/PDV/ECOMMERCE/WHATSAPP/MARKETPLACE_*), captura snapshot do veículo, margem por item.
- **Financeiro**: `ContaReceber`, `ContaPagar`, `MovimentoCaixa`, `ContaBancaria`, `PlanoConta` em árvore, conciliação por sessão de caixa.
- **Marketplaces**: `MarketplaceConta` (token, refresh), `MarketplaceAnuncio` (link ↔ Produto), `MarketplacePedido`, `MensagemMarketplace` (OmniInbox).
- **IA**: `InsightIA` (com `tipo`, `severidade`, `acaoSugerida`, `feedback`), `ConversaIA` + `MensagemIA` (histórico para fine-tune).
- **Auditoria**: `LogAuditoria` com `dadosAntes`/`dadosDepois` JSONB.

---

## 5. Módulos

| Módulo | Rotas | Status |
|---|---|---|
| Dashboard | `/dashboard` | ✅ indicadores + insights de IA |
| Frente de Caixa (PDV) | `/pdv` | ✅ busca por código, SKU, OEM e nome, leitor de código de barras, atalhos F2/F6/F9, trava de desconto por perfil. 🟡 placa só identifica o veículo; foto ainda não ligada |
| Caixa | `/caixa` | ✅ abertura, sangria e fechamento |
| Produtos | `/produtos` | 🟡 lista com curva, margem e estoque; cadastro e edição pela tela ainda não existem |
| Clientes | `/clientes` | 🟡 lista PF/PJ; cadastro pela tela ainda não existe; o "score" de crédito não é calculado pelo sistema |
| Catálogo veicular | `/veiculos` | ✅ montadora → modelo → versão |
| Fornecedores | `/fornecedores` | 🟡 lista; cadastro pela tela ainda não existe |
| Compras | `/compras` | 🟡 sugestão de compra e venda perdida; entrada de NF pela tela ainda não existe |
| Financeiro | `/financeiro` | 🟡 contas a receber e a pagar com vencimentos; baixa pela tela ainda não existe |
| Fiscal | `/fiscal` | 🟡 painel informativo; operações (cancelar, CC-e, inutilizar) só via API |
| Marketplaces | `/marketplaces` | 🟡 contas conectadas e mensagens com sugestão de IA, sem responder pela tela |
| Centro de IA | `/ia` | 🟡 catálogo de recursos e insights; os recursos ainda são chamados via API |

---

## 6. Recursos de IA

| Recurso | Modelo | Endpoint | Como invocar |
|---|---|---|---|
| AutoVision (foto → peça) | gpt-4o | `POST /api/ia/vision` | `multipart/form-data` com `foto` |
| NF-IA (OCR DANFE) | gpt-4o | `POST /api/ia/ocr-nf` | `multipart/form-data` com `arquivo` (PDF/IMG) |
| StockPredict (previsão) | gpt-4o-mini + heurística | `GET /api/ia/prever-demanda?produtoId=` | Por produto |
| StockPredict batch | gpt-4o-mini | `POST /api/ia/prever-demanda` | Gera insights da empresa |
| SmartCross | gpt-4o | `POST /api/ia/cross-reference` | Body: `{ nome, marca, codigoOem, ... }` |
| CopilotoBalcão (chat) | gpt-4o + tool use | `POST /api/ia/chat` | Body: `{ mensagem, historico }` |
| Insights IA | — | `GET /api/ia/insights` | Lista insights pendentes |
| MarginGuard | algoritmo | Inline em `/api/vendas` | Marca item abaixo da margem (não bloqueia) |

---

## 7. Como rodar

```bash
# 1) Dependências
npm install --legacy-peer-deps

# 2) Banco PostgreSQL (imagem com pgvector; o schema usa pg_trgm + unaccent)
docker run -d --name pg-autopecas \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=autopecas_erp \
  -p 5432:5432 \
  pgvector/pgvector:pg16

# 3) Variáveis de ambiente
cp .env.example .env
# edite: DATABASE_URL, OPENAI_API_KEY, ML/Shopee/Amazon, FOCUS_NFE_TOKEN
# fiscal: use sempre FOCUS_NFE_AMBIENTE=homologacao em teste

# 4) Schema e seed
npx prisma migrate dev
npm run db:seed   # dados de demonstração, não são de cliente real

# 5) Subir
npm run dev
# http://localhost:3000
```

---

## 8. Roadmap

A ordem do que vem primeiro está em `docs/AUDITORIA-2026-11-VENDA.md` ("Para vender em 30 dias"). Ideias para depois, sem data:

- [ ] **AutoVision 3D**: vídeo curto da peça → reconstrói modelo 3D para fichas técnicas.
- [ ] **Busca por voz no PDV** (não existe código hoje).
- [ ] **WhatsApp Business**: fluxo completo cliente → bot → orçamento → pagamento Pix.
- [ ] **TecDoc completo**: importar a base oficial (depende de licença).
- [ ] **Geofencing de entrega**: prever rota para entregas + integração com motoboys.
- [ ] **CreditSense**: score próprio de cliente baseado em pagamentos + sócios na Receita.
- [ ] **Catálogo SEFAZ + cruzamento de NCM**: validação automática de tributação.
- [ ] **App do vendedor externo**: terminar as telas do PWA `/m` e, depois, decidir se vale app nativo.

---

## Licença

Proprietária.

## Fontes de pesquisa

- [ERP para Autopeças 2026 — Grupo Trido](https://blog.grupotrido.com/erp-para-autopecas-como-escolher-o-melhor-sistema-em-2026/)
- [Sistema autopeças — vhsys](https://www.vhsys.com.br/segmentos/sistema-para-autopecas/)
- [Lexos ERP autopeças](https://www.lexos.com.br/erp/software-para-autopecas)
- [Compatibilidade autopeças Mercado Livre — Devs MELI](https://developers.mercadolivre.com.br/pt_br/compatibilidades-itens-e-produtos-de-autopecas)
- [SOFTClass / ERPClass](https://www.softclass.com.br/sistema-para-auto-pecas)
- [WinPro auto peças](https://winpro.com.br/sistema-para-auto-pecas/)
- [ZionSoft](https://zionsoft.com.br/sistema-para-auto-pecas)
- [TecDoc Catalogue Solutions](https://www.tips4y.pt/en/catalogue-solutions)
- [OCR para NF-e — IDP Document](https://idpdoc.com/conteudos/ocr-notas-fiscais-automatizar/)
- [Integração marketplace ERP — peçasprocarro](https://www.pecasprocarro.com.br/como-as-plataformas-de-integracao-via-api-estao-transformando-a-gestao-de-autopecas-no-e-commerce/)
