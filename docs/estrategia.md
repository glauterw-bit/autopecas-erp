# Estratégia — AutoPeças ERP (04/11/2026)

Base: `docs/AUDITORIA-2026-07.md`, `docs/conhecimento/*.md` (pesquisa de 04/11/2026) e conferência no código.

## Onde o produto está
- A cobertura é larga: 60 models, 66 rotas, fiscal, contábil, marketplaces, PDV com agente local, B2B, IA. Desde a auditoria de julho, todas as rotas passaram a ter guarda de perfil, e há 19 testes passando.
- Ainda **nenhuma loja real opera nele**. "Mais completo do mercado" só vale quando uma loja troca de sistema e não volta atrás.
- O fiscal ficou desatualizado pela lei, e não só por código incompleto. Quatro mudanças de 2026 afetam qualquer loja de SP hoje (veja `fiscal-tributario.md`):
  - autopeças saíram da ICMS-ST em SP em 01/10/2026 (Portaria SRE 34/2026);
  - o SAT acabou em 01/01/2026, e o varejo usa só NFC-e;
  - o regime normal tem destaque de IBS/CBS desde 03/08/2026, e o Simples terá a partir de 01/01/2027;
  - desde 03/11/2026, a devolução precisa referenciar o item da nota original.
- Falhas conferidas no código em 04/11/2026:
  - [emissor.ts:172](../src/lib/nfe/emissor.ts) manda PIS/COFINS fixo em CST "07", o que ignora o monofásico de autopeças;
  - [emissor.ts:89](../src/lib/nfe/emissor.ts) manda NCM "00000000" quando falta;
  - o emissor não tem grupo IBS/CBS;
  - a assinatura da Shopee é comparada sem tempo constante;
  - o mTLS do Pix está declarado, mas não é usado.
- A IA usa `gpt-4o` e `gpt-4o-mini`. A pesquisa diz que os dois desligam em 14/01/2027 e cita a página oficial de deprecações da OpenAI. **Confirme na página antes de agir.**

## O que o mercado mostra
- Os ERPs genéricos publicam preço de cerca de R$ 50 a R$ 650 por mês (Bling, Omie, vhsys, ERPClass). Os de autopeças não publicam preço nem detalhe de funções (`mercado.md`).
- O que lá fora existe e aqui não:
  - pedido da oficina direto no sistema, comparando fornecedores (Nexpart, PartsTech);
  - venda perdida com relatório (Epicor);
  - catálogo atualizado pelo fornecedor.
- A Mecanizou (mais de 3 mil oficinas, entrega média de 55 min na Grande SP) disputa a oficina com o balcão. A loja precisa responder com prazo, entrega e acerto.
- Cadastro ruim é a dor número 1 do setor. Não há benchmark público confiável de margem, giro ou ruptura no Brasil, então o ERP precisa medir isso no próprio cliente (`operacao-autopecas-e-crm.md`).
- Mercado Livre:
  - é o marketplace número 1 para autopeças e tem API de compatibilidade;
  - desde 15/07/2026, compatibilidade gerida pelo catálogo é só leitura;
  - o código atual para em 1.000 anúncios e espera tempo fixo no 429 (`marketplaces-e-apis.md`).

## Apostas, em ordem

| # | Aposta | Número que deve mudar | Quem faz | Versão de loja? |
|---|---|---|---|---|
| 1 | **Nota que sai certa em SP em nov/2026**: fim da ST no cadastro (CST/CSOSN/CFOP) e crédito do estoque de 30/09 (CAT 28/2020); PIS/COFINS por produto (monofásico CST 04); bloquear emissão sem NCM; grupos IBS/CBS; devolução referenciando item | Cenários fiscais com teste de valor passando, e notas aprovadas em homologação sem rejeição (partida: emissor sem IBS/CBS, CST fixo) | `erp-fiscal` (regra e código), `erp-autopecas` (NCM e casos reais), `erp-qa`, `erp-revisor` | Não |
| 2 | **IA antes do prazo da OpenAI**: confirmar a data, trocar os modelos em `src/lib/ai/client.ts` e migrar para Structured Outputs com conjunto de avaliação; DANFE pelo XML oficial (Distribuição DF-e), com OCR só de reserva | Acerto no conjunto de avaliação igual ou maior, custo por chamada menor, zero chamadas a modelo desligado | `erp-ia`, `erp-fiscal` (DF-e) | Não |
| 3 | **Fechar as brechas de integração e dinheiro**: mTLS e webhook Pix assinado, HMAC da Shopee em tempo constante, chave de placa fora da URL, rate limit em Redis (inclusive na IA), `pg_dump` fora do Railway | Achados abertos de segurança: de 6 para 0 | `erp-integracoes`, `erp-backend`, `erp-revisor` | Não |
| 4 | **Implantar a loja piloto** (vans/diesel, Taboão/Cotia): importar cadastro, estoque, preço e clientes do espelho que o Radar já tem (`erp_*`), com relatório de conferência e plano de virada | % do cadastro migrado e conferido; dias com a loja vendendo pelo ERP | `erp-implantacao`, `erp-autopecas`, `erp-produto` | Não |
| 5 | **Caixa que não para**: NFC-e em contingência offline e fila de vendas no disco do `agente-pdv` | Vendas fechadas com internet/SEFAZ fora (teste simulado); tempo de uma venda de balcão | `erp-pdv`, `erp-fiscal`, `erp-ux` | Não (atualiza agente na loja) |
| 6 | **Balcão que aprende**: botão "não tínhamos" (venda perdida) no PDV, retorno com motivo obrigatório, selo de aplicação verificada e painel de qualidade de cadastro; ficha da oficina com crédito, prazo e alerta de churn | Vendas perdidas registradas por semana; % do cadastro com aplicação verificada; oficinas em risco contatadas | `erp-autopecas`, `erp-crm-vendas`, `erp-ux`, `erp-backend`, `erp-frontend`, `erp-bi` | Não |
| 7 | **Mercado Livre completo**: paginação sem teto, 429 com jitter, compatibilidade de vans pela API, venda do ML vira venda no ERP (direto ou via Vallente) | Anúncios sincronizados contra o total da conta; pedidos do ML sem baixa manual | `erp-integracoes` | Não |

Preço e plano de venda para outras lojas (`erp-crescimento-receita`) vêm depois da aposta 4. Sem uma loja usando de verdade, não há o que vender.

## Medições
| Data | Aposta | Número de partida | Medir em |
|---|---|---|---|
| — | — | — | — |
