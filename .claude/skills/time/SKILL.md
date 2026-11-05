---
name: time
description: Põe o time de agentes do AutoPeças ERP para trabalhar num objetivo, do começo ao fim (produto → especialistas e pesquisa → experiência e visual → engenharia → testes → revisão → publicação → medição). Use quando o dono pedir para criar, melhorar, validar ou completar algo amplo no ERP (fiscal, PDV, estoque, CRM, marketplaces, implantação), ou digitar /time <objetivo>.
---

# Time do AutoPeças ERP

Objetivo pedido: $ARGUMENTS (se vazio, pegue a próxima aposta de `docs/estrategia.md`).

Siga as etapas em ordem. Cada etapa usa o agente de `.claude/agents/` com o nome indicado; se o tipo de agente não estiver disponível na sessão, use um agente general-purpose mandando ele ler o arquivo do papel primeiro.

1. **Decidir** — `erp-produto`: transforma o objetivo em um problema, um número a mover, até 3 apostas e uma escolhida, com critério de pronto. Se precisar de dado, chama `erp-bi` (números do sistema) ou `erp-pesquisa` (mercado, concorrentes, APIs, lei).
2. **Especificar** — em paralelo, só os que o assunto pede: `erp-autopecas` (regra de balcão, cadastro, estoque, compra), `erp-fiscal` (norma fiscal com fonte), `erp-crm-vendas` (carteira, funil, B2B), `erp-financeiro-contabil` (fato financeiro/contábil), `erp-implantacao` (migração de dados). Saída: regras, casos de teste com valores e peças reais.
3. **Desenhar** — em paralelo, só leitura: `erp-ux` (fluxo, textos, atalhos) e `erp-design` (visual e movimento). Saída: lista de mudanças com arquivo.
4. **Construir** — um agente por área, sem dois mexendo no mesmo arquivo: `erp-backend` (rotas, Prisma, migrações, workers), `erp-frontend` (telas), `erp-fiscal` (motor fiscal, NF-e, SPED), `erp-financeiro-contabil` (financeiro/contábil/Pix), `erp-integracoes` (marketplaces, APIs, webhooks), `erp-pdv` (caixa e agente local), `erp-ia` (prompt ou modelo). Cada um termina com commit e o resultado de `npx tsc --noEmit` e `npm test` (e `npm run build` se mexeu em rota ou tela).
5. **Testar** — `erp-qa`: roteiro mínimo do papel (caso motivador com valores, venda de balcão completa, entrada de nota, estorno, isolamento entre empresas, 403 por perfil). Fiscal só em homologação.
6. **Revisar** — `erp-revisor` recebe o diff (`git diff`), não a conclusão de quem fez. BLOQUEIA → volta à etapa 4. AJUSTAR → corrige e revisa de novo.
7. **Publicar** — só com OK do revisor e pedido explícito do dono nesta conversa. Na raiz de `~/autopecas-erp`: `railway up` (projeto `autopecas-erp`, serviço `autopecas-app`); depois `railway deployment list --service autopecas-app`, logs do `[bootstrap]` (migrações) e `GET /api/health`. Mudou `agente-pdv/`? Avise o dono para atualizar a máquina da loja. Se o Railway recusar por plano, pare e avise.
8. **Medir** — anote em `docs/estrategia.md` a data, o número de partida e quando medir (7 dias). Na medição, `erp-bi` traz o número e `erp-produto` decide se mantém, ajusta ou desfaz.

Regras do time:
- Um navegador por vez; banco de produção só com consultas curtas de leitura.
- Nunca emitir/cancelar nota em produção, cobrar cliente real, publicar anúncio ou mexer em conta real de marketplace sem o OK do dono.
- Nada de número inventado, alíquota sem fonte, avaliação falsa ou dado de demonstração que pareça real.
- Informe o dono em português simples a cada etapa concluída, em uma ou duas frases.
