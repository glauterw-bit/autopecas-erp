# Integração Vallente Hub (Mercado Livre)

O ERP se integra ao Vallente Hub (vallentehub.com.br) usando o provider **custom** do módulo ERP do Vallente. O fluxo de dados:

- **ERP → Vallente → ML**: custo (`costPrice`) e estoque (`stock`) dos produtos alimentam a precificadora e o sync de estoque do ML.
- **ML → Vallente → ERP**: vendas pagas do Mercado Livre são exportadas pelo Vallente e viram `Venda` no ERP (origem `MARKETPLACE_ML`, conta `VALLENTE_HUB`), com baixa de estoque e kardex. Idempotente por `mlOrderId` — reenvio não duplica.

## Endpoints expostos pelo ERP

Base: `{APP_URL}/api/integracoes/vallente` — autenticação por header `X-API-Key`.

| Endpoint | Método | Uso pelo Vallente |
|---|---|---|
| `/health` | GET | `testConnection()` do provider custom |
| `/products` | GET | `getProducts()` — sync de custo/estoque (aceita `?offset=&limit=`, padrão 5000) |
| `/orders` | POST | `createSaleOrder()` — exportação de vendas ML |

Campos de `/products` seguem o contrato do `GenericErpClient` do Vallente: `sku`, `description`, `costPrice`, `salePrice`, `stock`, `minStock`, `brand`, `ncm`, `ean`, `oem`, `partNumber`, `location`, `application` (aplicação veicular montadora/modelo/versão).

## Como conectar (passo a passo)

1. No ERP: **Configurações → Vallente Hub → Gerar chave de integração** (só ADMIN). Copie a chave `vlt_...` — ela aparece uma única vez. Rotacionar gera outra e invalida a anterior.
2. No Vallente Hub (como usuário do tenant): módulo **ERP → Conexões → provider `custom`** com:
   - `baseUrl`: `https://autopecas-app-production.up.railway.app/api/integracoes/vallente`
   - `apiKey`: a chave gerada (o client manda como `X-API-Key`)
3. Teste a conexão (`POST /erp/connections/custom/test` na UI do Vallente).
4. Rode os syncs pelo Vallente: `sync/cost-prices/custom`, `sync/stock/custom`, `sync/export-sales/custom`.

## Cuidados de produção (Vallente em prod com clientes ativos)

- A integração é **pull do lado do Vallente** — o ERP nunca chama a API do Vallente, portanto não adiciona carga ao Postgres do Vallente além dos syncs que o próprio tenant disparar.
- Evitar `export-sales` com `days` grande na primeira execução (backfill pesado já derrubou o Postgres do Vallente no passado). Começar com `days: 7`.
- A API key dá acesso ao catálogo da empresa e permite criar vendas — tratar como segredo, rotacionar se vazar.
