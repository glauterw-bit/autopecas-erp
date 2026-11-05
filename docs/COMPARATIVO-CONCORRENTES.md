# Comparativo — AutoPeças ERP e concorrentes

**Revisado em 04/11/2026** (bloqueador 8 de `docs/AUDITORIA-2026-11-VENDA.md`).

## Como ler este arquivo

- A versão anterior marcava com ✅ ou ❌ funções de Lexos, Linx, vhsys, Bling, SOFTClass, WinPro e ZionSoft **sem fonte**. Esses ERPs quase não publicam suas funções (`docs/conhecimento/mercado.md`, seção 2), então aquela grade foi retirada. Dizer que um concorrente "não tem" algo sem prova é publicidade comparativa sem base.
- Também saíram "🆕 inovação proprietária", "ninguém tem reunido em um único produto" e números sem medição (OCR "97%+", "75% de economia" com cache).
- O que sabemos dos concorrentes com fonte está em `docs/conhecimento/mercado.md`. Use só o que estiver marcado [E] lá, e confira no site antes de pôr em material de venda.

Legenda do nosso estado:
- ✅ **funciona**: código e tela prontos (ainda sem loja real operando).
- 🟡 **beta**: código existe, mas falta tela, teste real ou parte da função.
- 🚧 **em desenvolvimento**: só a base existe.
- ❌ **não existe**.

## Cadastros e catálogo

| Função | Estado | Evidência / o que falta |
|---|---|---|
| Cadastro por SKU, EAN, OEM e fabricante | 🟡 | campos no schema; criar e editar produto pela tela ainda não existe (`src/app/(app)/produtos/page.tsx:31` aponta para `/produtos/novo`, que não existe) |
| Aplicação veicular (montadora → modelo → versão) | ✅ estrutura | `prisma/schema.prisma`, tela `/veiculos` |
| Busca por aplicação | 🟡 | existe em `src/lib/catalogo/busca.ts:59`, mas o PDV não passa a versão do veículo |
| Equivalência de peça com IA (SmartCross) | 🚧 | só API (`src/lib/ai/cross-reference.ts`); confirmação humana obrigatória |
| Importação TecDoc | 🟡 | `src/lib/catalogo/tecdoc*.ts`; depende de licença |
| Curva ABC | ✅ | campo e lista em `/produtos` |
| Busca semântica (pgvector) | ❌ | o pgvector está desligado (`prisma/schema.prisma:19-21` e `:448`) |
| Identificação de peça por foto (AutoVision) | 🚧 | só API (`src/lib/ai/vision.ts`); o botão do PDV não está ligado (`src/components/pdv/pdv-client.tsx:328`) |

## PDV / frente de caixa

| Função | Estado | Evidência / o que falta |
|---|---|---|
| Leitor de código de barras | ✅ | `src/components/pdv/pdv-client.tsx` |
| Atalhos de teclado (F2 cliente, F6 desconto, F9 pagar) | ✅ | `pdv-client.tsx:51-55,295-304` |
| Busca por placa | 🟡 | identifica marca, modelo e ano com provedor pago (`src/lib/catalogo/placa.ts:33`); não filtra as peças |
| Trava de desconto por perfil e preço mínimo | ✅ | `src/app/api/vendas/route.ts:143,175` e `src/lib/vendas/politica-desconto.ts` |
| MarginGuard | 🟡 | só **marca** item abaixo da margem, sem bloquear e sem considerar o desconto (`src/app/api/vendas/route.ts:155`) |
| Busca por voz | ❌ | não há código de voz |

## Estoque e compras

| Função | Estado | Evidência / o que falta |
|---|---|---|
| Multi-depósito, transferência e inventário | 🟡 | `src/components/estoque/` |
| Sugestão de compra e venda perdida | 🟡 | `/compras/sugestao` |
| Previsão de demanda (StockPredict) | 🟡 | `src/lib/ai/prediction.ts`; a IA cita sazonalidade, **sem dado de clima real**; acerto a medir |
| Entrada por XML de NF-e | 🟡 | `src/lib/nfe/importar-xml.ts`; sem tela em Compras |
| Leitura de DANFE por IA (NF-IA) | 🚧 | só API (`src/lib/ai/ocr-nf.ts`); a área de envio em `/compras` ainda não funciona; precisão a medir na loja piloto |
| Sugestão de preço de venda na entrada | ❌ | não implementada no NF-IA |

## Fiscal

| Função | Estado | Evidência / o que falta |
|---|---|---|
| NF-e 55 e NFC-e 65 | 🟡 | emissão ao faturar (`src/app/api/vendas/[id]/faturar/route.ts`) via Focus NFe; configuração por loja e IBS/CBS pendentes |
| Cancelamento, CC-e, inutilização | 🟡 | só API (`src/lib/nfe/operacoes.ts`); a tela fiscal mostra o endereço da API no lugar do botão |
| ICMS-ST, DIFAL, IPI, PIS/COFINS | 🟡 | `src/lib/fiscal/calculo.ts` com testes; o emissor ainda manda PIS/COFINS fixo |
| SPED (ECD, EFD-ICMS/IPI, Contribuições) | 🟡 | gera TXT (`src/lib/contabil/sped.ts`); **não validado no PVA** |
| SAT (modelo 59) | ❌ para SP | o SAT acabou em SP em 01/01/2026 (Portaria SRE 79/2024, `docs/conhecimento/fiscal-tributario.md`); em SP o balcão usa NFC-e |

## Marketplaces

| Função | Estado | Evidência / o que falta |
|---|---|---|
| Mercado Livre (anúncios, pedidos, perguntas) | 🟡 | `src/lib/marketplaces/mercado-livre.ts`; para em 1.000 anúncios (`MAX_PAGINAS = 20`, linha 25); sem teste com conta real |
| Compatibilidade de autopeças no ML | 🟡 | mesmo arquivo; sem teste com conta real |
| Shopee, Amazon | 🟡 | `shopee.ts`, `amazon.ts`; sem teste com conta real |
| Magalu | 🟡 | `magalu.ts`; envio de mensagem não implementado |
| OmniInbox (mensagens num lugar só) | 🚧 | lista mensagens com rascunho da IA em `/marketplaces`; não responde pela tela |
| IA respondendo sozinha | ❌ (de propósito) | a IA só sugere; quem atende revisa e envia |
| WhatsApp | 🚧 | a entrada vai para a primeira empresa do banco (`src/app/api/ia/whatsapp/route.ts:50`) |

## Financeiro

| Função | Estado | Evidência / o que falta |
|---|---|---|
| Contas a pagar e a receber | 🟡 | lista em `/financeiro`; baixa pela tela ainda não existe |
| Caixa (abertura, sangria, suprimento, fechamento) | ✅ | `src/components/caixa/caixa-client.tsx` |
| Conciliação OFX | 🟡 | `src/lib/financeiro/`; sem tela de importação |
| Crediário | 🟡 | `src/lib/vendas/crediario.ts` |
| Pix dinâmico | 🟡 | `src/lib/pagamentos/pix.ts`; sem teste com PSP real |
| DRE e plano de contas | 🟡 | `src/lib/contabil/`; conferência com contador pendente |
| Score de crédito do cliente por IA | ❌ | a coluna "Score IA" em `/clientes` mostra um campo que nenhum código calcula |

## IA (OpenAI, `src/lib/ai/client.ts`)

Todos os recursos de IA estão em beta ou em desenvolvimento, e nenhum tem precisão medida. A regra do produto vale para todos: a IA sugere e a pessoa confirma, e a IA nunca inventa preço ou estoque.

| Recurso | Estado |
|---|---|
| AutoVision (foto → peça) | 🚧 só API |
| NF-IA (leitura de DANFE) | 🚧 só API |
| StockPredict | 🟡 job diário |
| SmartCross | 🚧 só API |
| Copiloto de balcão (chat com ferramentas) | 🚧 só API; isolamento entre empresas a corrigir (auditoria, bloqueador 1) |
| Insights com retorno da pessoa (útil / não útil) | 🟡 |

## O que pode virar argumento de venda, e com que cuidado

Sem pesquisa que prove exclusividade, não dizemos "ninguém mais tem". O que dá para dizer com honestidade:

1. Feito para autopeças: aplicação veicular, OEM e equivalência estão no centro do cadastro.
2. IA que sugere e deixa a pessoa decidir, sem inventar preço nem estoque.
3. Fiscal com regra explicada e bloqueio na dúvida, em vez de deixar passar (objetivo do produto; hoje parcial).

Evidência sobre concorrentes que hoje temos com fonte (`docs/conhecimento/mercado.md`):
- Os ERPs de autopeças quase não publicam preço nem funções [E].
- "Nenhum mostra publicamente B2B com oficina ou registro de venda perdida" e "não achamos ERP brasileiro de autopeças com IA anunciada de forma concreta" são **hipóteses** [H], não fatos. Não use como "somos os únicos".

Números de ganho (tempo de balcão, erro de nota, ruptura) serão medidos na loja piloto e só entram em material de venda depois disso.
