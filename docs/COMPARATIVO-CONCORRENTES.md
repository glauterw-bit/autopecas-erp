# Comparativo de funcionalidades — AutoPeças ERP vs concorrentes

Matriz de funcionalidades cruzando o AutoPeças ERP com os principais players do mercado brasileiro de software para auto peças (referências: Linx, Lexos, vhsys, SOFTClass/ERPClass, Bling, Tiny, WinPro, ZionSoft, TECNICON, Omie, ERPPro, ERPSuite).

> Legenda: ✅ disponível · ⚠️ limitado · ❌ não tem · 🆕 inovação proprietária

## Cadastros e catálogo

| Funcionalidade | AutoPeças ERP | Lexos | Linx | vhsys | Bling | SOFTClass |
|---|---|---|---|---|---|---|
| Cadastro por SKU + EAN + OEM + Fabricante | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| Aplicação veicular (Montadora→Modelo→Versão) | ✅ | ✅ | ✅ | ❌ | ⚠️ | ✅ |
| Cross-reference (peça equivalente) | ✅ + IA 🆕 | ⚠️ manual | ⚠️ manual | ❌ | ❌ | ⚠️ manual |
| Catálogo TecDoc / Cinoa importável | ✅ planejado | ✅ | ✅ | ❌ | ❌ | ⚠️ |
| Curva ABC automática | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ |
| Embedding vetorial p/ busca semântica | ✅ pgvector 🆕 | ❌ | ❌ | ❌ | ❌ | ❌ |
| Identificação por foto (vision) | ✅ AutoVision 🆕 | ❌ | ❌ | ❌ | ❌ | ❌ |

## PDV / Frente de Caixa

| Funcionalidade | AutoPeças ERP | Lexos | Linx | vhsys | WinPro | ZionSoft |
|---|---|---|---|---|---|---|
| Bipagem código de barras | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Busca por placa (Sinesp/API) | ✅ 🆕 | ❌ | ⚠️ | ❌ | ❌ | ❌ |
| Filtro automático por aplicação | ✅ | ✅ | ⚠️ | ❌ | ⚠️ | ⚠️ |
| Atalhos de teclado (F2-F9) | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| MarginGuard (bloqueio inline) | ✅ 🆕 | ❌ | ❌ | ❌ | ❌ | ❌ |
| Identificação peça por foto | ✅ AutoVision 🆕 | ❌ | ❌ | ❌ | ❌ | ❌ |
| Voz / busca por comando | ✅ roadmap | ❌ | ❌ | ❌ | ❌ | ❌ |

## Estoque e compras

| Funcionalidade | AutoPeças ERP | Concorrência |
|---|---|---|
| Multi-depósito | ✅ | ✅ |
| Inventário rotativo | ✅ | ✅ |
| Ponto de reposição automático | ✅ | ✅ (alguns) |
| **Previsão de demanda híbrida (ML + IA)** | ✅ StockPredict 🆕 | ❌ |
| Reserva de estoque por pedido marketplace | ✅ | ⚠️ |
| **OCR de NF de entrada via IA** | ✅ NF-IA 🆕 (gpt-4o) | ⚠️ (algumas têm OCR mas exigem ajuste manual constante) |
| Sugestão de preço de venda na entrada | ✅ | ⚠️ |

## Fiscal

| Funcionalidade | AutoPeças ERP |
|---|---|
| NF-e (modelo 55) | ✅ via Focus NFe |
| NFC-e (modelo 65) | ✅ |
| SAT (modelo 59) | ✅ |
| Carta de correção | ✅ |
| Inutilização | ✅ |
| Multi-CFOP por estado | ✅ |
| Substituição tributária por NCM | ✅ |

> Equivalente à maioria dos concorrentes — pré-requisito do mercado.

## Marketplaces

| Funcionalidade | AutoPeças ERP | Bling/Tiny | Linx | vhsys |
|---|---|---|---|---|
| Mercado Livre (anúncios, pedidos) | ✅ | ✅ | ✅ | ⚠️ |
| **Compatibilidade ML (universal/catálogo/atributos)** | ✅ | ✅ | ⚠️ | ❌ |
| Shopee | ✅ | ✅ | ⚠️ | ⚠️ |
| Amazon SP-API | ✅ | ✅ | ✅ | ❌ |
| Magalu | ✅ planejado | ✅ | ✅ | ⚠️ |
| **OmniInbox (mensagens unificadas)** | ✅ 🆕 | ❌ | ❌ | ❌ |
| **IA respondendo automaticamente** | ✅ 🆕 | ❌ | ❌ | ❌ |
| Sincronia bidirecional de estoque | ✅ | ✅ | ✅ | ✅ |

## Financeiro

| Funcionalidade | AutoPeças ERP |
|---|---|
| Contas a pagar/receber | ✅ |
| Fluxo de caixa | ✅ |
| Conciliação bancária | ✅ |
| Crediário próprio | ✅ |
| Pix / cartão / boleto / dinheiro | ✅ |
| Múltiplas contas bancárias | ✅ |
| Plano de contas hierárquico | ✅ |
| DRE | ✅ |
| **Score de crédito do cliente via IA** | ✅ CreditSense 🆕 |

## Inteligência Artificial — onde realmente nos descolamos

| Recurso de IA | AutoPeças ERP | Mercado |
|---|---|---|
| Identificação de peça por foto (vision) | ✅ OpenAI gpt-4o | ❌ |
| OCR de NF-e com 97%+ via IA | ✅ OpenAI gpt-4o | ⚠️ (alguns têm OCR tradicional, sem visão semântica) |
| Previsão de demanda híbrida (ML + LLM) | ✅ OpenAI gpt-4o-mini | ❌ |
| Cross-reference inteligente | ✅ OpenAI gpt-4o | ❌ |
| Chat com tool-use no catálogo | ✅ OpenAI gpt-4o | ❌ |
| Insights persistidos com feedback humano | ✅ | ❌ |
| Prompt caching (75% economia) | ✅ | n/a |
| Score de crédito IA | ✅ planejado | ❌ |
| WhatsApp Business com IA | ✅ planejado | ❌ |

## Resumo executivo

**O que o mercado tem hoje:** PDV razoável, NF-e funcional, integração marketplace via hubs terceiros, busca por aplicação veicular adequada, alguns têm OCR de NF de entrada.

**O que ninguém tem reunido em um único produto:**

1. Identificação de peça por **foto**.
2. **OCR semântico** de NF-e (entende contexto, não só posição).
3. **Previsão de demanda** com fatores externos explicados em linguagem natural.
4. **Cross-reference** via julgamento técnico da IA.
5. **OmniInbox** com IA respondendo marketplaces.
6. **MarginGuard** inline no PDV protegendo margem em tempo real.
7. Estrutura multi-tenant + multi-empresa + auditoria desde o dia 1.
8. Vetor `pgvector` para busca semântica nativa no banco.

Esses 8 pontos são o que justificam o ticket premium da plataforma e o que torna ela inviável de "copiar em 3 meses" pelos concorrentes — exige reescrever schema, escolher provedor de IA, desenhar prompts, treinar a operação para confiar nas sugestões.
