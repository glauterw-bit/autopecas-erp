# Marketplaces, catálogos, pagamentos e APIs para o AutoPeças ERP

**Data da pesquisa:** 2026-11-04.
**Legenda:**
- **[E]** = evidência, com link.
- **[H]** = hipótese ou inferência nossa, a confirmar.

Nenhuma tarifa foi inventada. Quando a fonte oficial não abriu, isso vem dito.

## 1. Mercado Livre (o canal que mais pesa para autopeças)

### Compatibilidades
- A API amarra a peça ao veículo por domínio:
  - `domain_id` → `compatible_domain_id`, por exemplo `*-CARS_AND_VANS_FOR_COMPATIBILITIES`;
  - os veículos são lidos em `catalog_domains/$domain_id`;
  - a busca de veículos usa `catalog_compatibilities/products_search/chunks`;
  - a gravação usa `POST /items/$ITEM_ID/compatibilities`.
  - [E] [compat. BR](https://developers.mercadolivre.com.br/pt-br/compatibilidades-itens-e-produtos-de-autopecas), [domínios](https://developers.mercadolibre.com.ar/en_us/domains-products-and-attributes-vehicle-accessories)
- Mudança de **15/07/2026**:
  - as compatibilidades geridas pelo catálogo do ML passam a ter só leitura resumida (marca e total);
  - essas só são editadas na plataforma do ML;
  - as criadas pelo vendedor seguem editáveis via API.
  - [E] [doc](https://developers.mercadolibre.com.ar/en_us/compatibility-between-items-and-vehicle-accessories)
- Os IDs exatos do MLB precisam ser conferidos ao vivo. [H]

### Notificações
- Tópicos citados nas fontes:
  - `orders_v2` (o recomendado);
  - `questions`;
  - `items`;
  - `items_prices`;
  - `claims`, `invoices` e `stock fulfillment` aparecem na lista nova.
- O payload traz só `resource`, `topic`, `user_id` e `attempts`. O integrador faz GET no recurso para ter os dados.
- O ML recomenda responder 200 rápido e processar por fila.
- [E] [notificações](https://developers.mercadolivre.com.br/produto-receba-notificacoes)
- Não achamos assinatura HMAC documentada para as notificações. [H]

### Limite de taxa
- O controle é por Client ID e por endpoint.
- A recomendação é backoff com *jitter*, sem picos.
- Scroll expirado gera 429.
- RPM maior se pede ao time comercial, com evidência de uso.
- Nenhum número oficial foi publicado.
- [E] [429](https://developers.mercadolivre.com.br/pt-br/rate-limit-erro-429)

### Logística
- Full = `logistic_type: fulfillment`. Flex = `self_service`. ME1 = logística própria com etiqueta e rastreio via API.
- [E] [envios](https://developers.mercadolivre.com.br/en_us/mercadoenvios-mode-2), [gestão](https://developers.mercadolibre.com.ar/devsite/manage-shipments)

### Tarifas 2026
- Não conseguimos abrir a página oficial.
- Fontes de terceiros falam em:
  - Clássico de 10 a 14% e Premium de 15 a 19%, variando por categoria;
  - mudança de custos em 02/03/2026 para itens abaixo de R$ 79.
  - Os valores do custo fixo divergem entre as fontes.
  - [E, terceiro] [Priceva](https://priceva.com/pt/calculadora-taxas-mercado-livre), [Tecnospeed](https://blog.tecnospeed.com.br/?p=34484)
- Tarifa específica de "autopeças": **não confirmada**. Use o simulador da conta do vendedor. [H]

### Reputação e catálogo obrigatório
Não achamos fonte oficial nesta rodada. Fica pendente. [H]

## 2. Outros marketplaces

| Canal | API aberta? | O que exige / observação |
|---|---|---|
| **Shopee** | Sim, Open Platform v2. | <ul><li>HMAC-SHA256 com `partner_key`.</li><li>O push deve responder 2xx com corpo vazio.</li><li>O doc oficial bloqueou o fetch; o formato exato da assinatura foi confirmado só em SDKs.</li><li>[E, terceiro] [SDK](https://packagist.org/packages/minchao/shopee-php), [diretório](https://matrix-db-api-directory.pages.dev/api/shopee)</li></ul> |
| **Amazon SP-API** | Sim. | <ul><li>O Brasil usa a região NA, `A2Q3Y263D00KWC`. [E] [IDs](https://developer-docs.amazon.com/sp-api/docs/marketplace-ids)</li><li>*Fitment* de autopeças no BR: nada encontrado. [H] O ML é o caminho prático.</li></ul> |
| **Magalu** | Sim, developers.magalu.com. | <ul><li>Pedidos, SAC, Magalog e webhooks (v0 e v1), com OAuth.</li><li>[E] [índice](https://docsearch.algolia.com/mcp/docs/website/developers.magalu.com)</li></ul> |
| **Americanas** | Credencial gerada no painel do seller. | <ul><li>Caminho: Integrações → Credenciais API.</li><li>Sem portal público achado.</li><li>[E] [UpSeller](https://upseller.com/pt/help-doc-article-307)</li></ul> |
| **Casas Bahia** | Sem portal público achado. | <ul><li>A integração passa por conector, como a VTEX.</li><li>[E] [VTEX](https://help.vtex.com/en/docs/tracks/casas-bahia-marketplace-integration)</li></ul> |
| **TikTok Shop BR** | Partner Center. | <ul><li>Não achamos doc oficial.</li><li>Integradores (Plug4Market e UpSeller) já conectam.</li><li>[E] [Tecnospeed](https://blog.tecnospeed.com.br/integracao-tiktok-shop/)</li></ul> |
| **Shein** | Restrita. | <ul><li>Parceria com o Bling, a partir do plano Cobalto.</li><li>[E] [Startups](https://startups.com.br/negocios/shein-escolhe-bling-como-1a-parceiro-de-erp-no-brasil/)</li><li>Baixa aderência a autopeças. [H]</li></ul> |

## 3. Hubs e integradores

- **Anymarket:** "planos a partir de R$ 54/mês", segundo uma listagem de parceiro. [E] [Loja Integrada](https://lojaintegrada.com.br/loja-aplicativos/anymarket)
- **Ideris:** planos Meli Expert, Lite, Pro e Plus. Preço por contrato. [E] [AWS](https://aws.amazon.com/marketplace/pp/prodview-lsjhlauuc6ypo), [Bling](https://blog.bling.com.br/ideris-o-que-e/)
- **Plugg.to e Hub2b:** sem preço público encontrado. [H]
- **Vallente:** já integrado por pull (`docs/INTEGRACAO-VALLENTE.md`). Cobre o ML com precificadora.
- Sugestão [H]: ML direto (volume e compatibilidades); o resto via hub.

## 4. Catálogos de aplicação e bases de veículos

- **TecDoc/TecAlliance:**
  - Chegou ao Brasil em 2015 com 26 marcas. [E] [O Mecânico](https://omecanico.com.br/tecdoc-oficializa-chegada-ao-brasil/)
  - Licença por assinatura anual, sem tabela pública. [E] [Mecânica Online](https://mecanicaonline.com.br/2015/04/reparador-brasileiro-tem-acesso-ao-catalogo-eletronico-de-pecas-mais-completo-da-europa)
  - A cobertura de frota nacional (Gol, Strada, vans diesel) é incerta. [H]
- **Fabricantes nacionais:**
  - A Fras-le comprou a Nakata.
  - A plataforma Auto Experts junta os catálogos de Fras-le, Nakata, Fremax e Master.
  - Nenhuma API pública foi achada. [E] [Auto Experts](https://www.autoexperts.parts/en/br/about)
  - Cofap, Sabó e Bosch: nada de API achado. [H]
- **ACES/PIES (EUA):**
  - Versões ACES 5.0 e PIES 8.0. [E] [MOTOR](https://www.motor.com/2026/04/aces-5-pies-8-data-standards-update/)
  - API JSON da Auto Care desde jan/2025, paga.
  - [E] [Hedges](https://hedgescompany.com/?p=42988)
  - Serve de **modelo de dados**, não de fonte para o Brasil. [H]
- **FIPE:** a API comunitária parallelum (v2) é gratuita, mas não oficial e sem SLA. [E] [GitHub](https://github.com/parallelum/fipe-go)
- **Placa:**
  - O Sinesp Cidadão **não tem API pública**. Os clientes que existem fazem engenharia reversa, estão abandonados e sofrem bloqueio. [E] [chapeupreto/sinesp](https://github.com/chapeupreto/sinesp), [sinesp-client](https://github.com/victor-torres/sinesp-client)
  - Provedores privados:
    - consultadeplaca.net: R$ 0,07 por consulta básica, sem dados do dono. [E] [consultadeplaca](https://consultadeplaca.net/desenvolvedores)
    - Apify: cerca de US$ 1,20 por consulta encontrada, com o dono mascarado por LGPD. [E] [Apify](https://apify.com/brasildados/consulta-veiculo-por-placa.md)
    - WDAPI e Placas.app: preço não confirmado. [H]

## 5. Pagamentos

- **Pix (padrão BCB):**
  - Exige OAuth 2.0 com **mTLS** (RFC 8705), TLS 1.2 ou mais, e certificado não autoassinado. [E] [Bradesco/BCB](https://banco.bradesco/pix/assets/docs/api_pix_200.pdf)
  - No webhook, a Efí exige mTLS. O `x-skip-mtls-checking` passa a validação ao integrador. [E] [Efí](https://dev.efipay.com.br/en/docs/api-pix/webhooks/)
- **Pix Automático:**
  - Recursos `rec`, `solicrec` e `webhookrec`. [E] [Cielo](https://docs.cielo.com.br/pix-can-cbk/reference/autentica%C3%A7%C3%A3o)
  - Consentimento do pagador mais cobranças no contrato. [E] [Woovi](https://developers.woovi.com/docs/woovi-prompts/pix-automatico)
  - Alguns PSPs **não** gerenciam a periodicidade: o recebedor precisa de um motor próprio. [E] [Iugu](https://dev.iugu.com/docs/cobrar-com-pix-automatico-por-api)
- **Asaas:**
  - 100 Pix por mês grátis, mas só por chave ou QR estático.
  - QR dinâmico segue a tarifa do contrato.
  - [E] [Asaas](https://blog.asaas.com/pix-cobra-taxa)
- **Maquininha e TEF:**
  - Mercado Pago Point: a API de Orders substitui a legada, com OAuth e notificação. A nota fiscal fica com o PDV. [E] [MP](https://mercadopago.com.br/developers/pt/docs/mp-point/integration-configuration/integrate-with-pdv/introduction)
  - Cielo Conecta: API ou biblioteca de PinPad. [E] [Cielo](https://blog.cielo.com.br/produtos-e-servicos/cielo-conecta-saiba-tudo-sobre-essa-solucao-que-simplifica-a-contratacao-de-meios-de-pagamentos-integrados)
  - CliSiTef: biblioteca local. [E] [CIGAM](https://www.cigam.com.br/wiki/index.php/Como_Fazer_-_TEF_M%C3%B3dulo_Gest%C3%A3o_de_Lojas_-_SiTef_e_CliSiTef)
  - PayGo: a DLL exige homologação. [E] [ACBr](https://www.projetoacbr.com.br/forum/topic/85945-ativa%C3%A7%C3%A3o-e-utiliza%C3%A7%C3%A3o-do-pix-e-carteiras-digitais-no-tef-paygo/)
  - Stone, PagBank, Inter e Sicoob: não verificados. [H]

## 6. Distribuidores e cotação B2B

- **DPK:** tem o portal KDaPeça para o varejo. [E] [O Mecânico](https://omecanico.com.br/dpk-disponibiliza-portal-de-venda-de-pecas-e-servicos-para-varejo/)
- **Pellegrino, Sama e os demais:** nenhuma API ou EDI pública. [E, ausência] O caminho é pedir a doc ao comercial ou à TI. [H]
- **Peça.Aí:** marketplace B2B multimarca para oficinas, com 20% da Bosch desde 2023. [E] [AutoData](https://www.autodata.com.br/revistas/flipbook/419-2025-03/33/)
- **Outros:** Canal da Peça e CotaComigo. [E] [Dealroom](https://app.dealroom.co/companies/canal_da_pe_a), [Gust](https://gust.com/companies/cotacomigo)
- **"Cotaí":** não encontrado.

## 7. WhatsApp Cloud API

- **Cobrança:**
  - Por mensagem entregue desde 01/07/2025.
  - Desde **01/10/2026**, as mensagens de serviço e de utilidade dentro da janela também são cobradas.
  - Há franquia de **1.000 mensagens de serviço por mês por número**.
  - A janela de anúncio CTWA é grátis por 7 dias.
  - [E] [Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- **Faturamento em BRL:**
  - Pela Facebook Brasil desde jul/2026.
  - A migração é obrigatória até 30/06/2027. Depois disso, a Meta para de entregar mensagens de contas não BRL. [E] (mesma fonte)
- Os valores por categoria em BRL não foram lidos na tabela oficial. Os números de terceiros divergem. [H]

## 8. Boas práticas transversais

- Webhook: responder 2xx rápido, mandar para a fila e deduplicar pelo id do evento.
  - [E] [ML](https://developers.mercadolivre.com.br/produto-receba-notificacoes)
- Retry de 429 com backoff mais *jitter*. [E] [ML 429](https://developers.mercadolivre.com.br/pt-br/rate-limit-erro-429)
- Assinatura conferida em tempo constante. Segredo fora da URL e dos logs.
- Refresh de token com trava, para dois workers não queimarem o mesmo refresh. [H]

## Tabela: integração × prioridade × custo × esforço

| Integração | Prioridade | Custo | Esforço |
|---|---|---|---|
| ML: compatibilidades, `orders_v2` e `questions` | **P0** | Tarifa ML por venda; API grátis [E] | Médio |
| Webhook Pix com mTLS (Efí ou banco) | **P0** | Tarifa do PSP [E] | Médio |
| WhatsApp com controle de custo por loja | **P0** | Por mensagem, serviço cobrado desde 10/2026 [E] | Baixo |
| Placa com 2 provedores (fallback) | P1 | Cerca de R$ 0,07 por consulta (consultadeplaca) [E] | Baixo |
| Shopee push assinado | P1 | API grátis [H] | Baixo |
| Magalu e Americanas via webhook | P2 | API grátis [H] | Médio |
| Hub (Anymarket/Ideris) para cauda longa | P2 | A partir de R$ 54 por mês (Anymarket) [E] | Baixo |
| Pix Automático (assinatura do ERP) | P2 | Tarifa do PSP [H] | Médio |
| TEF (SiTef/PayGo) ou Point/Conecta | P2 | Homologação e licença [H] | Alto |
| TecDoc | P3 | Licença anual sem preço público [E] | Alto |
| Amazon, TikTok e Shein | P3 | — | Médio |
| EDI com distribuidor (DPK etc.) | P3 | Desconhecido | Alto, sem API pública |

## O que isso muda para o AutoPeças ERP

1. **Compatibilidades no ML**
   - O `src/lib/marketplaces/mercado-livre.ts` só lista anúncios. Falta publicar compatibilidades (`POST /items/{id}/compatibilities`) a partir da aplicação veicular do catálogo (`src/lib/catalogo/busca.ts`).
   - Desde 15/07/2026, as compatibilidades do catálogo do ML são só leitura. Só as do vendedor podem ser editadas.
2. **Retry do ML**
   - O `comRetry` (mercado-livre.ts:30) espera `Retry-After` ou 1 segundo fixo.
   - Falta adicionar *jitter* e um orçamento por Client ID, como o ML pede.
   - Com `MAX_PAGINAS = 20` × 50, a busca para em 1.000 anúncios. Lojas maiores precisam de scroll (dentro da validade, para não tomar 429). [H]
3. **Webhook dos marketplaces**
   - Em `src/app/api/webhooks/marketplaces/route.ts`, a assinatura da Shopee é comparada com `assinatura !== calc`. Trocar por `crypto.timingSafeEqual`.
   - Para o ML, que não assina, fazer sempre o GET do `resource` antes de agir. Nunca confiar no corpo.
4. **mTLS no Pix ainda é decorativo**
   - O `certificadoPemPath` existe em `src/lib/pagamentos/pix.ts:119`, mas nenhum `httpsAgent` o usa. O BCB exige mTLS.
   - O webhook (`src/app/api/webhooks/pix/route.ts`) depende só de `?token=`. Com Efí, use mTLS ou valide o emissor se usar skip-mTLS.
5. **Pix Automático**
   - O `src/lib/pagamentos/pix-recorrente.ts` precisa de um agendador próprio da periodicidade, porque alguns PSPs não gerenciam isso.
   - Também precisa tratar o `webhookrec`.
6. **Consulta por placa**
   - O `src/lib/catalogo/placa.ts` põe `PLACA_API_KEY` na URL. A chave vaza em log e proxy: mover para header, se o provedor aceitar.
   - Adicionar um segundo provedor de fallback.
   - Remover a menção ao Sinesp, que não tem API pública e cujos clientes não oficiais são bloqueados.
7. **TecDoc**
   - O `src/lib/catalogo/tecdoc.ts` e o `tecdoc-sync.ts` assumem dados TecDoc, mas a licença é anual e sem preço público, e a cobertura nacional é incerta.
   - Antes de comprar, testar a cobertura com 50 SKUs reais de uma loja.
   - Enquanto isso, a fonte de aplicação mais barata é a do próprio ML. [H]
8. **WhatsApp**
   - O `src/lib/marketplaces/whatsapp.ts` usa a Graph v20.0. Com o serviço cobrado desde 01/10/2026, registrar a categoria e o custo de cada envio, por loja.
   - Preparar a conta BRL antes de 30/06/2027.
9. **Mensagens no OmniInbox**
   - O `listarMensagensNaoLidas()` de Magalu e Amazon devolve `[]`. A Magalu precisa de consumidor de webhook (v1).
   - A Amazon depende da aprovação da role Buyer Communication. Desligar a promessa na UI até lá.
10. **Hub contra integração direta**
    - Manter o Vallente e o ML direto.
    - Para Americanas, Casas Bahia, TikTok e Shein, expor o mesmo contrato de `/api/integracoes/vallente/products` para hubs como Anymarket e Ideris, em vez de escrever um adaptador por canal. [H]

## Fontes

- ML compatibilidades: https://developers.mercadolivre.com.br/pt-br/compatibilidades-itens-e-produtos-de-autopecas · https://developers.mercadolibre.com.ar/en_us/compatibility-between-items-and-vehicle-accessories · https://developers.mercadolibre.com.ar/en_us/domains-products-and-attributes-vehicle-accessories
- ML notificações: https://developers.mercadolivre.com.br/produto-receba-notificacoes
- ML 429: https://developers.mercadolivre.com.br/pt-br/rate-limit-erro-429
- ML envios: https://developers.mercadolivre.com.br/en_us/mercadoenvios-mode-2 · https://developers.mercadolibre.com.ar/devsite/manage-shipments
- ML tarifas (terceiros): https://priceva.com/pt/calculadora-taxas-mercado-livre · https://blog.tecnospeed.com.br/?p=34484
- Shopee: https://packagist.org/packages/minchao/shopee-php · https://matrix-db-api-directory.pages.dev/api/shopee
- Amazon: https://developer-docs.amazon.com/sp-api/docs/marketplace-ids
- Magalu: https://docsearch.algolia.com/mcp/docs/website/developers.magalu.com
- Americanas e Casas Bahia: https://upseller.com/pt/help-doc-article-307 · https://help.vtex.com/en/docs/tracks/casas-bahia-marketplace-integration
- TikTok e Shein: https://blog.tecnospeed.com.br/integracao-tiktok-shop/ · https://startups.com.br/negocios/shein-escolhe-bling-como-1a-parceiro-de-erp-no-brasil/
- Hubs: https://lojaintegrada.com.br/loja-aplicativos/anymarket · https://aws.amazon.com/marketplace/pp/prodview-lsjhlauuc6ypo · https://blog.bling.com.br/ideris-o-que-e/
- TecDoc: https://omecanico.com.br/tecdoc-oficializa-chegada-ao-brasil/ · https://mecanicaonline.com.br/2015/04/reparador-brasileiro-tem-acesso-ao-catalogo-eletronico-de-pecas-mais-completo-da-europa · https://automechanika-argentina.german-pavilion.com/en/sites/exhibitors/135771
- Fabricantes: https://www.autoexperts.parts/en/br/about
- ACES/PIES: https://www.motor.com/2026/04/aces-5-pies-8-data-standards-update/ · https://hedgescompany.com/?p=42988
- FIPE: https://github.com/parallelum/fipe-go
- Placa: https://github.com/chapeupreto/sinesp · https://github.com/victor-torres/sinesp-client · https://consultadeplaca.net/desenvolvedores · https://apify.com/brasildados/consulta-veiculo-por-placa.md
- Pix: https://banco.bradesco/pix/assets/docs/api_pix_200.pdf · https://dev.efipay.com.br/en/docs/api-pix/webhooks/ · https://docs.cielo.com.br/pix-can-cbk/reference/autentica%C3%A7%C3%A3o · https://developers.woovi.com/docs/woovi-prompts/pix-automatico · https://dev.iugu.com/docs/cobrar-com-pix-automatico-por-api · https://blog.asaas.com/pix-cobra-taxa
- TEF e maquininha: https://mercadopago.com.br/developers/pt/docs/mp-point/integration-configuration/integrate-with-pdv/introduction · https://blog.cielo.com.br/produtos-e-servicos/cielo-conecta-saiba-tudo-sobre-essa-solucao-que-simplifica-a-contratacao-de-meios-de-pagamentos-integrados · https://www.cigam.com.br/wiki/index.php/Como_Fazer_-_TEF_M%C3%B3dulo_Gest%C3%A3o_de_Lojas_-_SiTef_e_CliSiTef · https://www.projetoacbr.com.br/forum/topic/85945-ativa%C3%A7%C3%A3o-e-utiliza%C3%A7%C3%A3o-do-pix-e-carteiras-digitais-no-tef-paygo/
- Distribuidores e B2B: https://omecanico.com.br/dpk-disponibiliza-portal-de-venda-de-pecas-e-servicos-para-varejo/ · https://www.autodata.com.br/revistas/flipbook/419-2025-03/33/ · https://app.dealroom.co/companies/canal_da_pe_a · https://gust.com/companies/cotacomigo
- WhatsApp: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
