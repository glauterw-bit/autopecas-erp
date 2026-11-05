# UX, design e IA: AutoPeças ERP

Pesquisa de 04/11/2026. **[E]** = evidência com link. **[H]** = hipótese a validar em loja real.

## 1. Balcão: teclado primeiro

- **Ritmo do balcão.** O balconista atende com o telefone numa mão e o leitor na outra. Cada clique a mais vira fila. O fluxo deve ser busca → item → quantidade → próximo, sem largar o teclado. [H]
- **O que os líderes fazem:**
  - Lightspeed X-Series: segurar Alt/Option mostra dicas de atalho na tela de venda; F5 estaciona a venda e F6 abre o histórico. [E](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534134339867-Sell-screen-keyboard-shortcuts-on-desktop)
  - Square: ⌘F busca e ⌘1–5 trocam de seção. [E](https://community.squareup.com/t5/Product-Updates/Search-and-sell-faster-with-a-connected-keyboard/ba-p/823725)
  - Shopify POS: lançou navegação por teclado. [E](https://changelog.shopify.com/posts/keyboard-shortcuts-and-navigation-in-shopify-pos)
- **Para copiar:** teclas F fixas (F2 busca, F9 finaliza, Esc volta), dicas ao segurar Alt e paleta Ctrl+K. [H]
- **Densidade.** Num ERP, tabela densa rende mais que card. Linhas de 32 a 36 px, números à direita em fonte tabular. Estoque, preço, localização e aplicação ficam na mesma linha. [H]
- **Busca tolerante a erro:**
  - `pg_trgm` + `unaccent` já cobrem erro de digitação.
  - Faltam as abreviações do balcão ("AMORT DIANT", "PAST", "COMB", "RESERV"). No Radar, um mapa de sinônimos desse tipo melhorou o acerto da busca. [H]
  - Código OEM deve ser aceito com ou sem pontuação, e a placa também deve entrar na mesma caixa. [H]
- **Cuidado com o cmdk.** O Command do shadcn usa o cmdk, que filtra pelo texto renderizado. Para as abreviações funcionarem, cada item precisa de `keywords`. [E](https://ui.shadcn.com/docs/components/radix/command) [E](https://platform.plainconcepts.com/docs/components/command)

## 2. Referências de mercado

- **Shopify POS.** Vende em dinheiro sem internet e sincroniza depois. [E](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/selling-offline)
- **Odoo POS:**
  - guarda o cadastro no navegador e mostra quantos pedidos faltam sincronizar; [E](https://www.odoo.com/forum/help-1/how-is-the-point-of-sale-offline-mode-working-218314)
  - o modo offline geral do Odoo é só leitura e serve para quedas curtas. [E](https://www.odoo.com/documentation/master/applications/general/offline_mode.html)
  - Lição: o estado "offline · X pendentes" precisa estar sempre à vista.
- **Bling e Omie.** Não achamos fonte primária sobre a UX de implantação deles, então não afirmamos nada. [H]
- **UpSeller.** Importa produtos do Bling por planilha .xls/.xlsx, com até 5.000 SKUs por arquivo, mostra o erro linha a linha e aceita reenvio. [E](https://upseller.com/pt/help-doc-article-2129) Esse é o padrão mínimo para um importador.

## 3. Acessibilidade WCAG 2.2

- **Critérios novos** que pesam no nosso caso [E](https://www.w3.org/TR/WCAG22/) [E](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html):
  - 2.4.11 Foco não obscurecido (AA): o rodapé fixo do carrinho não pode cobrir o campo em foco.
  - 2.5.7 Arrastar (AA): toda ação de arrastar precisa de alternativa por clique.
  - 2.5.8 Alvo mínimo de 24×24 px CSS (AA).
  - 3.3.7 Entrada redundante (A).
  - 3.3.8 Autenticação acessível (AA): o login deve aceitar colar senha.
- **No PDV:** Tab na ordem do fluxo, margem ruim com ícone e texto (não só cor), `aria-live` ao adicionar item. [H]

## 4. Design system e dashboards

- **Componentes e tokens.** Já há Radix, `cva` e `@tanstack/react-table`. Falta um `components/ui/` único, tokens semânticos (`--positivo`, `--alerta`, `--perigo`) e uma tabela densa só para produtos, estoque e financeiro. [H]
- **Paleta Ctrl+K.** A base pronta é o `CommandDialog` do shadcn. [E](https://ui.shadcn.com/docs/components/radix/command)
- **Dashboards:** uma pergunta por bloco (número grande, comparação, ação "ver 12 itens"); insights de IA como fila de ações; nunca só verde/vermelho. [H]

## 5. Implantação e migração

- **Onde as lojas desistem.** Não achamos dado público confiável. Nossa hipótese é que a desistência se concentra em três pontos [H]:
  - cadastro de produtos e aplicação veicular;
  - certificado A1 e primeira nota autorizada;
  - primeiro caixa que não fecha.
- **Importador de dados:** export cru do sistema antigo, mapa de colunas, pré-visualização, erro por linha com reenvio, e XMLs de compras antigas (custo, fornecedor e NCM corretos). [H]
- **Métrica-guia.** Tempo até a primeira NFC-e autorizada, por empresa. [H]

## 6. App do vendedor externo

- **Fluxo.** Em `src/app/m/*` com Capacitor (já existe o `scanner`): cliente → catálogo com estoque por loja → pedido. [H]
- **Offline.** O IndexedDB pode ser apagado pelo navegador. É preciso pedir `navigator.storage.persist()`. [E](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) Pedido feito offline vai para fila, com UUID. [H]
- **Toque.** Alvos de 44 px ou mais no celular, acima do mínimo da WCAG. [H]

## 7. IA: modelos e preços (nov/2026)

- **Urgente: dois modelos em uso vão desligar.**
  - `gpt-4o` (snapshots 2024-08-06 e 2024-11-20) e `gpt-4o-mini` **desligam em 14/01/2027**. O substituto indicado é o `gpt-6-luna`. [E](https://developers.openai.com/api/docs/deprecations)
  - O `src/lib/ai/client.ts` usa exatamente esses dois.
- **Linha atual da OpenAI** [E](https://developers.openai.com/api/docs/models):
  - `gpt-6-astra`: o carro-chefe;
  - `gpt-6.1-sol`: quase o mesmo desempenho, mais barato;
  - `gpt-6.1-terra`: rápido e bom em raciocínio visual;
  - `gpt-6-luna`: o mais eficiente.
- **Preços Standard** em US$ por 1M tokens [E](https://developers.openai.com/api/docs/pricing):

  | Modelo | Entrada | Cache | Saída |
  |---|---|---|---|
  | gpt-6-astra | 10,00 | 1,00 | 50,00 |
  | gpt-6.1-sol | 2,00 | 0,10 | 10,00 |
  | gpt-6.1-terra | 1,00 | 0,05 | 5,00 |
  | gpt-6-luna | 0,10 | 0,01 | 0,50 |
  | gpt-4o | 2,50 | 1,25 | 10,00 |
  | gpt-4o-mini | 0,15 | 0,075 | 0,60 |

  - Batch e Flex custam cerca de metade disso.
  - A página não traz preço específico de imagem para a linha GPT-6.
- **Prompt caching** [E](https://developers.openai.com/api/docs/guides/prompt-caching): automático; do GPT-5.6 em diante, prefixo de 1.024+ tokens, TTL padrão de 30 min e leitura a 0,1× (0,05× no 6.1 Sol/Terra). Só vale para prefixo idêntico: fixo primeiro, dado do cliente por último.
- **Structured Outputs** [E](https://developers.openai.com/api/docs/guides/structured-outputs):
  - a OpenAI recomenda Structured Outputs (`json_schema`, `strict`) em vez do JSON mode;
  - a recusa do modelo chega no campo `refusal`.
  - Hoje 5 arquivos usam `json_object` e depois extraem o JSON por regex (`extrairJson`).
- **Alternativas (preço de tabela):**
  - Anthropic [E](https://claude.com/pricing):
    - Opus 5.5: 4/20;
    - Sonnet 5.5: 2/10;
    - Haiku 5.5: 0,10/0,50 (prompts até 100K tokens).
  - Google [E](https://aistudio.google.com/docs/pricing):
    - Gemini 3.1 Pro Preview: 2/12;
    - Gemini 3.8 Flash: 0,75/3,75 até 31/12/2026, e o preço dobra em 2027;
    - Gemini 3.1 Flash-Lite: 0,25/1,50.
  - Não temos benchmark próprio de peças ou de DANFE para comparar qualidade entre eles. [H]

## 8. Visão: peça e DANFE

- **O "~97%" não tem fonte.** O `docs/ARQUITETURA.md` cita "~97% de acurácia em OCR fiscal" sem referência, e não achamos número público confiável. [H]
- **DANFE: melhor não ler.** Com a chave de acesso, a Distribuição DF-e, depois da manifestação do destinatário, devolve o XML oficial. [E](https://www.flexdocs.net/guiadistDFe/WS.NFe.html) O OCR fica de reserva, sempre com conferência humana. [H]
- **Foto da peça.** A IA sugere de 3 a 5 candidatos do *nosso* catálogo, nunca um código livre. O balconista confirma. [H]

## 9. Evals, alucinação, custo e LGPD

- **Evals.**
  - A plataforma de Evals da OpenAI desliga em 30/11/2026 e a recomendação passa a ser Datasets. [E](https://developers.openai.com/api/docs/guides/evals)
  - Melhor ter um conjunto próprio no repositório: 100 a 200 fotos e DANFEs anonimizados, rodados a cada troca de modelo. [H]
- **Guarda numérica.** O chat só cita preço e estoque vindos de tool, e uma checagem pós-geração corta todo R$ ou quantidade que não bata (regra que funciona no Radar). [H]
- **Custo por loja.** Tokens por chamada com `empresaId` e teto mensal que rebaixa o modelo ou pausa a IA. [H]
  - Exemplo: 1.000 chamadas com 3.000 tokens de entrada e 300 de saída custam cerca de US$ 0,45 no `gpt-6-luna` e US$ 10,50 no `gpt-4o`. Os preços são de tabela; os volumes são hipotéticos.
- **LGPD nos prompts.** Mascarar CPF/CNPJ, telefone e dado financeiro antes da chamada, citar a OpenAI como suboperadora no contrato e não logar o prompt cru. [H]

## O que isso muda para o AutoPeças ERP

1. **Trocar `AI_MODELS` antes de 14/01/2027.** Em `src/lib/ai/client.ts`, testar `gpt-6-luna` (fast) e `gpt-6.1-terra` (visão) contra um eval próprio.
2. **Structured Outputs com Zod.** Migrar `ocr-nf.ts`, `vision.ts`, `cross-reference.ts` e `prediction.ts`, tratar `refusal` e aposentar o `extrairJson`.
3. **XML oficial pela chave.** Em `src/lib/ai/ocr-nf.ts` + `src/lib/compras/receber-nota.ts`, buscar via DF-e e deixar o OCR de reserva.
4. **Guarda numérica.** No fim de `src/lib/ai/chat.ts`, cortar todo R$ ou quantidade que não venha das tools.
5. **Uso de IA por `empresaId`.** Migração nova com tabela de uso e teto mensal; prompts ordenados para aproveitar o cache.
6. **Eval versionado.** Criar `tests/ia/` e corrigir o "97%" sem fonte em `docs/ARQUITETURA.md`.
7. **PDV no teclado.** Em `src/app/(app)/pdv`: teclas F, dicas no Alt, Ctrl+K com `keywords` e foco visível.
8. **Sinônimos de balcão.** Tabela de abreviações por empresa usada em `/api/produtos/buscar-pdv`.
9. **Importador de implantação.** Mapa de colunas, erro por linha e XMLs de compras; medir o tempo até a 1ª NFC-e.
10. **App externo.** Em `src/app/m/*`: catálogo offline com `storage.persist()`, fila com UUID e alvos de 44 px.

## Fontes
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/models
- https://developers.openai.com/api/docs/deprecations
- https://developers.openai.com/api/docs/guides/prompt-caching
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/guides/evals
- https://claude.com/pricing
- https://aistudio.google.com/docs/pricing
- https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534134339867-Sell-screen-keyboard-shortcuts-on-desktop
- https://community.squareup.com/t5/Product-Updates/Search-and-sell-faster-with-a-connected-keyboard/ba-p/823725
- https://changelog.shopify.com/posts/keyboard-shortcuts-and-navigation-in-shopify-pos
- https://help.shopify.com/en/manual/sell-in-person/shopify-pos/selling-offline
- https://www.odoo.com/documentation/master/applications/general/offline_mode.html
- https://www.odoo.com/forum/help-1/how-is-the-point-of-sale-offline-mode-working-218314
- https://upseller.com/pt/help-doc-article-2129
- https://www.w3.org/TR/WCAG22/
- https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- https://ui.shadcn.com/docs/components/radix/command
- https://platform.plainconcepts.com/docs/components/command
- https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- https://www.flexdocs.net/guiadistDFe/WS.NFe.html
