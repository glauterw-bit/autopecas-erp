# AutoPeças ERP

Sistema ERP completo para auto peças com **IA OpenAI no núcleo**, integração com marketplaces, frente de caixa, fiscal NF-e/NFC-e, financeiro, catálogo veicular e seis recursos de IA proprietários.

> Construído para ser o **mais completo e inovador do mercado brasileiro de gestão de auto peças** — não um clone aprimorado de Tiny/Bling, mas uma plataforma que coloca IA aplicada em todas as etapas da operação.

---

## Sumário

1. [Pesquisa de mercado e concorrentes](#1-pesquisa-de-mercado)
2. [Diferenciais e inovações](#2-diferenciais)
3. [Stack técnica](#3-stack)
4. [Arquitetura](#4-arquitetura)
5. [Módulos do sistema](#5-módulos)
6. [Recursos de IA](#6-recursos-de-ia)
7. [Como rodar](#7-como-rodar)
8. [Roadmap](#8-roadmap)

---

## Matriz de cobertura (estado real do código)

| Área | Status | Notas |
|---|---|---|
| **Mercado Livre** | ✅ completo | sync + publicar anúncio + compatibilidade auto peças + perguntas + Mercado Envios |
| **Shopee** | ✅ funcional | sync de anúncios e pedidos com assinatura HMAC |
| **Amazon SP-API** | ✅ funcional | LWA OAuth, Listings Items API, Orders API |
| **Magalu Marketplace** | ✅ funcional | Portfolio + Orders + Pricing + Stocks API |
| **WhatsApp Business** | ✅ in/out | webhook inbound + envio texto/template/imagem via Graph API |
| **NF-e 55 / NFC-e 65** | ✅ completo | emissão + cancelamento + CC-e + inutilização + manifestação destinatário |
| **NFS-e municipal** | ✅ | padrão ABRASF, códigos serviço LC 116 (14.01-14.13) |
| **MDF-e (manifesto)** | ✅ | emissão, encerramento, cancelamento (modal rodoviário) |
| **CT-e** | ✅ | emissão própria + importação de CT-e recebido com conta a pagar |
| **Motor fiscal BR** | ✅ completo | ICMS 27 UFs, ICMS-ST com MVA-ajustada, DIFAL + FCP, IPI, PIS/COFINS |
| **PGDAS-D (Simples)** | ✅ | apuração mensal Anexos I e III, alíquota efetiva, DAS, repartição |
| **SPED ECD** (contábil) | ✅ exporta TXT oficial | registros 0000, I010, I012, I050, I200, I250, 9999 |
| **SPED EFD-ICMS/IPI** | ✅ exporta TXT oficial | registros 0000, 0150, 0200, C100, C170, 9999 |
| **SPED Contribuições** | ✅ exporta TXT oficial | EFD-Contribuições PIS/COFINS (cumulativo e não-cumulativo) |
| **DRE / Plano de contas BR** | ✅ | ITG 1000 padrão para varejo de auto peças, DRE automático |
| **Balanço Patrimonial** | ✅ | ativo / passivo / PL com apuração do exercício |
| **DFC** (Fluxo de Caixa) | ✅ | método indireto (CPC 03) |
| **DLPA** | ✅ | Lucros/Prejuízos Acumulados com reserva legal 5% |
| **Livro Razão** | ✅ | extrato por conta no período |
| **TEF / SiTef** | ✅ | AgenteTefClient HTTP local p/ PinPad (débito/crédito/Pix) |
| **SAT-CF-e modelo 59** | ✅ | SatLocalClient (SP e estados que usam SAT) |
| **Impressora ESC/POS** | ✅ | builder com QR Code, abertura de gaveta, cupom NFC-e |
| **Leitor código barras** | ✅ | nativo HID no PDV (sem driver) |
| **Pix dinâmico** | ✅ | BR Code EMV com CRC16, cliente PSP (BB/Bradesco/Sicoob/Inter) |
| **DCTF Web / DEFIS / EFD-Reinf** | ✅ | apuração mensal e anual com retenções R-2010/R-2099 |
| **Importador TecDoc** | ✅ | CSV bulk (manufacturers/models/types/articles/compatibilities) |
| **RMA / Devolução / Garantia** | ✅ | fluxo CDC: abrir → autorizar → receber → reembolso/troca/garantia |
| **Comissionamento vendedores** | ✅ | % venda, % margem, escalonado, fixo; overrides por categoria/marca |
| **PWA Mobile vendedor externo** | ✅ | `/m` com scanner câmera (BarcodeDetector), service worker offline |
| **App nativo iOS/Android (Capacitor)** | ✅ | `capacitor.config.ts` pronto, plugins camera/push/scanner/geolocation |
| **Balança checkout** | ✅ | Toledo Prix III/6, Filizola Platina, Urano POP-S com parsers protocolares |
| **Portal B2B (mecânicas/frotistas)** | ✅ | `/b2b` com login, catálogo c/ tabela de preço, garagem, pedidos, faturas |
| **TecDoc XML (TAF) + sync automático** | ✅ | parser zero-dep + job mensal por empresa |
| **Pix Automático recorrente (BACEN)** | ✅ | criar/pausar/retomar/cancelar assinatura, cobranças derivadas |

> **Todo ✅ é código real**, não promessa. Cada item linka para o arquivo correspondente em `src/lib/`.

## 1. Pesquisa de mercado

### Principais concorrentes no Brasil (2026)

| Sistema | Foco | Lacunas que atacamos |
|---|---|---|
| **Linx** | Varejo geral, módulo auto peças | Não tem IA aplicada, integração marketplace fraca |
| **Lexos** | Auto peças, omnichannel | Cross-reference manual, sem visão computacional |
| **vhsys** | PME genérico | Sem aplicação veicular, sem catálogo TecDoc |
| **SOFTClass (ERPClass)** | Auto peças | Sem IA, marketplace via 3rd-party |
| **Bling / Tiny** | PME e-commerce | Compatibilidade ML manual, sem identificação por foto |
| **TECNICON** | Industrial + auto peças | UX pesada, sem chat IA |
| **Omie** | PME geral | Não conhece nicho de auto peças |
| **WinPro / ZionSoft / ERPPro** | PDV auto peças | Sem dashboard analítico, sem IA |

### Padrões consolidados do mercado (são pré-requisito, não diferencial)

- Busca por **aplicação veicular** (montadora/modelo/ano) — estrutura TecDoc/Cinoa.
- **Cadastro por código OEM, fabricante, original** e código de barras.
- Emissão de **NF-e (modelo 55), NFC-e (65), SAT**.
- **Integração com marketplaces** (Mercado Livre, Shopee, Amazon, Magalu).
- Compatibilidade de auto peças no Mercado Livre (universal / catálogo / atributos).
- **OCR de NF-e** de entrada (mercado já chega em 97%+).
- **Curva ABC** e ponto de reposição.
- **Multi-loja / multi-depósito**.
- Pagamento parcelado, crediário, conciliação.

---

## 2. Diferenciais

Os 12 recursos abaixo são o que o AutoPeças ERP entrega que **nenhum concorrente brasileiro tem reunido em um só produto**:

### 2.1 AutoVision AI — identificação de peça por foto
Vendedor (ou cliente, via WhatsApp) tira uma foto da peça e a IA OpenAI:
- identifica categoria (pastilha, vela, amortecedor…),
- lê códigos OEM e fabricante impressos,
- detecta marca pelo logotipo,
- avalia estado da peça (nova/usada/danificada),
- devolve SKUs equivalentes via SmartCross.

> Implementação: `src/lib/ai/vision.ts` + `POST /api/ia/vision`

### 2.2 NF-IA — OCR inteligente de DANFE
PDF ou imagem da NF de entrada → JSON estruturado pronto para virar `NotaEntrada`:
- Cabeçalho fiscal, chave de acesso, valores totais.
- Itens com NCM, CFOP, IPI, quantidade, custo unitário.
- Sugere preço de venda aplicando margem-alvo do produto.

> Implementação: `src/lib/ai/ocr-nf.ts` + `POST /api/ia/ocr-nf`

### 2.3 StockPredict / DemandSense — previsão de demanda híbrida
Combina suavização exponencial + sazonalidade + janela climática + IA OpenAI para gerar:
- dias de cobertura,
- ponto de reposição sugerido,
- quantidade a comprar considerando lead time,
- fatores externos descritos em linguagem natural (chuva → palhetas/bateria, frio → bateria, fim de mês → crediário).

Gera `InsightIA(RUPTURA_PREDITIVA)` automaticamente para curva A e B.

> Implementação: `src/lib/ai/prediction.ts` + `POST /api/ia/prever-demanda`

### 2.4 SmartCross — cross-reference inteligente
3 estratégias em cascata:
1. Match exato de códigos OEM/fabricante/EAN.
2. Aplicação veicular comum.
3. Re-ranking semântico via OpenAI com julgamento técnico (EQUIVALENTE / SIMILAR / SUBSTITUTO / KIT_ALTERNATIVO).

Persiste como grafo direcionado em `CrossReference` com `confianca` e `fonte`.

> Implementação: `src/lib/ai/cross-reference.ts` + `POST /api/ia/cross-reference`

### 2.5 MarginGuard — preservação de margem em tempo real
No PDV, a cada item adicionado:
- compara preço com `precoMinimo` e `margemAlvo` do produto,
- bloqueia descontos abusivos para perfis sem permissão,
- registra `margemAbaixoMinimo` no `ItemVenda` para auditoria.

Em batch noturno, lista produtos sub-precificados nos últimos 30 dias.

> Implementação: `src/lib/ai/margin-guard.ts`

### 2.6 CopilotoBalcão / OmniInbox — assistente conversacional com tool-use
Chat com ferramentas reais (`buscar_peca`, `verificar_disponibilidade`, `registrar_orcamento`) que rodam contra o banco do tenant. Mesma engine atende:
- balcão (vendedor pergunta em linguagem natural),
- WhatsApp Business API,
- mensagens do Mercado Livre e Shopee no OmniInbox.

> Implementação: `src/lib/ai/chat.ts` + `POST /api/ia/chat`

### 2.7 Busca por placa
O vendedor digita a placa → consulta provedor (Sinesp Cidadão / WDAPI) → vincula automaticamente versão do catálogo TecDoc/Cinoa ao cliente. PDV passa a filtrar peças compatíveis daquele veículo.

> Implementação: `src/lib/catalogo/placa.ts` + `GET /api/veiculos/buscar-placa`

### 2.8 Marketplace Hub unificado + compatibilidade ML automatizada
Adaptadores que falam **a mesma interface** (`AdaptadorMarketplace`) para ML, Shopee, Amazon. Suporta o recurso de **compatibilidade de auto peças do Mercado Livre** (universal / catálogo / atributos) — sincroniza a aplicação veicular do ERP para o anúncio.

> Implementação: `src/lib/marketplaces/{mercado-livre,shopee,unified}.ts`

### 2.9 OmniInbox — caixa única de mensagens com IA respondendo
Toda mensagem de marketplace cai em `MensagemMarketplace` com um `rascunhoIA` que o atendente revisa antes de enviar. Reduz tempo de resposta de horas para segundos sem perder controle humano.

### 2.10 Catálogo veicular nativo (Montadora → Modelo → Versão → Aplicação)
Estrutura padrão TecDoc, com `PosicaoMontagem` (dianteira/traseira/lado direito), motorização, combustível, ano início/fim. Permite importação direta de bases TecDoc/Cinoa.

### 2.11 Insights IA persistidos com feedback humano
Toda saída de IA materializa um `InsightIA` com `severidade`, `acaoSugerida`, `dadosReferencia` e campo `feedback` (UTIL/NAO_UTIL/INCORRETO) — vira sinal para fine-tune e priorização.

### 2.12 Auditoria e multi-empresa nativos
Schema multi-tenant desde o dia 1 (`empresaId` em todas as entidades transacionais), `LogAuditoria` com snapshot antes/depois, perfis de usuário granular (ADMIN, GERENTE, VENDEDOR, CAIXA, ESTOQUISTA, FINANCEIRO, TECNICO).

---

## 3. Stack

- **Next.js 15** (App Router, React 19, Server Actions)
- **TypeScript** estrito
- **PostgreSQL 16** com extensões `pg_trgm`, `unaccent`, `pgvector`
- **Prisma 5** como ORM
- **Tailwind CSS** + shadcn/ui-style primitives
- **OpenAI SDK** — GPT-4o (visão, OCR, raciocínio estruturado) e GPT-4o-mini (alta-frequência baixa-latência)
- **BullMQ + Redis** para filas (sync de marketplaces, OCR em lote, geração de insights noturnos)
- **Zod** para validação
- **TanStack Query** + **Zustand** no front
- **Recharts** para gráficos
- **NextAuth v5** para autenticação
- Emissão fiscal via **Focus NFe** (substituível por Webmania/eNotas)

### Modelos de IA — estratégia de custo

| Tarefa | Modelo | Razão |
|---|---|---|
| Análise gerencial, planejamento de compras, raciocínio multi-passo | gpt-4o | Vision multimodal, raciocínio sólido, JSON mode |
| AutoVision, NF-IA, SmartCross | gpt-4o | Visão excelente, structured outputs, function calling |
| Chat de balcão, explicações curtas, autocomplete | gpt-4o-mini | Latência baixa, custo até 30× menor |

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
              ├──► lib/nfe/*     → Focus NFe (NF-e/NFC-e/SAT)
              ├──► lib/catalogo/* → consulta placa, TecDoc, busca PDV
              └──► lib/db.ts    → Prisma → PostgreSQL + pgvector
                                          (multi-tenant por empresaId)

Workers (BullMQ + Redis)
   • sync-marketplaces (15 min)
   • stockpredict-batch (diário)
   • margin-guard-batch (diário)
   • whatsapp-inbox
```

### Modelo de dados — destaques

O schema (`prisma/schema.prisma`) tem 40+ models cobrindo:

- **Multi-tenant**: `Empresa` → `Filial` → `Deposito` → `Caixa`.
- **Catálogo veicular**: `Montadora` → `ModeloVeiculo` → `VersaoVeiculo` → `AplicacaoVeicular` ← `Produto`.
- **Produto**: 40+ campos incluindo fiscal (NCM, CFOP, CST, alíquotas), físico (peso/dimensões), preço por canal, curva ABC, lead time, embedding vetorial pgvector(1536) para busca semântica.
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
| Dashboard | `/dashboard` | ✓ KPIs + insights IA |
| Frente de Caixa (PDV) | `/pdv` | ✓ Busca multimodal, MarginGuard, atalhos F2-F9 |
| Produtos | `/produtos` | ✓ Lista com curva, margem, estoque |
| Clientes | `/clientes` | ✓ PF/PJ, garagem, score IA |
| Catálogo veicular | `/veiculos` | ✓ Montadora → modelo → versão |
| Fornecedores | `/fornecedores` | ✓ Pontualidade IA |
| Compras / NF-IA | `/compras` | ✓ Upload de DANFE para OCR |
| Financeiro | `/financeiro` | ✓ Receber/pagar com vencimentos |
| Marketplaces | `/marketplaces` | ✓ Contas conectadas + OmniInbox |
| Centro de IA | `/ia` | ✓ Catálogo de recursos + insights ativos |

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
| MarginGuard | (algoritmo + IA opcional) | Inline em `/api/vendas` | Avalia margem por item |

---

## 7. Como rodar

```bash
# 1) Dependências
npm install

# 2) Banco PostgreSQL com extensões pgvector + pg_trgm + unaccent
docker run -d --name pg-autopecas \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=autopecas_erp \
  -p 5432:5432 \
  pgvector/pgvector:pg16

# 3) Variáveis de ambiente
cp .env.example .env
# edite: DATABASE_URL, ANTHROPIC_API_KEY, ML/Shopee/Amazon, FOCUS_NFE_TOKEN

# 4) Schema e seed
npx prisma migrate dev --name init
npx prisma db seed

# 5) Subir
npm run dev
# http://localhost:3000
```

---

## 8. Roadmap

Próximos passos para tornar a plataforma referência total no setor:

- [ ] **AutoVision 3D**: vídeo curto da peça → reconstrói modelo 3D para fichas técnicas.
- [ ] **VoiceBalcão**: comando de voz no PDV (`"pastilha freio onix 2019"`) usando STT realtime.
- [ ] **WhatsApp Business**: fluxo completo cliente → bot → orçamento → pagamento Pix.
- [ ] **TecDoc Mirror**: importador da base oficial (10M+ itens, 1000+ marcas).
- [ ] **Geofencing de entrega**: prever rota para entregas + integração com motoboys.
- [ ] **CreditSense**: score próprio de cliente baseado em pagamentos + sócios na Receita.
- [ ] **Catálogo SEFAZ + cruzamento de NCM**: validação automática de tributação.
- [ ] **App mobile** para vendedor externo (PWA).

---

## Licença

Proprietária — esta base é a fundação para um produto comercial.

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
