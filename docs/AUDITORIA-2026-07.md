# Auditoria completa — AutoPeças ERP (02/07/2026)

Auditoria de código feita por 4 análises independentes (fiscal, operação core, integrações, plataforma/segurança), com evidência arquivo:linha. Objetivo: mapear o que **mudar, melhorar e adicionar** para ser o sistema mais completo do mercado com 100% de funcionalidade real, inclusive fiscal.

## Veredito por frente

| Frente | Nota | Situação real |
|---|---|---|
| Catálogo de autopeças (OEM, cross-ref, aplicação veicular, placa) | 9/10 | Real e acima do mercado |
| PDV / Vendas | 7/10 | Real, faltam caixa (sangria/fechamento), condicional, trava de desconto |
| Estoque | 6/10 | Kardex/depósitos reais; transferência entre lojas e inventário sem fluxo/UI |
| Compras | 6/10 | XML/OCR de entrada reais; custo médio NÃO atualiza; sem grade de fornecedores |
| OS e RMA/Garantia | 9/10 | Completos (workflow + CDC) |
| Financeiro | 7/10 | Contas/conciliação OFX reais; sem boleto/DDA; sem webhook Pix |
| Contábil | 5/10 | DRE/BP/DFC reais mas calculados do operacional; **sem partidas dobradas** |
| **Fiscal — emissão** | 7/10 | Real via **Focus NFe** (terceirizado); sem contingência, sem gestão de certificado |
| **Fiscal — SPED/declarações** | 3/10 | TXT sintaticamente ok, **não passa no PVA** (faltam blocos E, H, G, C190); DCTF/DEFIS/Reinf são cálculo interno, não transmissíveis |
| Marketplaces | 7/10 | ML completo; Shopee/Amazon/Magalu parciais; **webhooks sem verificação de assinatura** |
| Hardware PDV (TEF/SAT/impressora/balança) | 8/10 | Clientes reais, mas dependem de agente local que ainda não existe como executável |
| Segurança / plataforma | 4/10 | **31/44 rotas API sem RBAC; senha B2B = 4 últimos dígitos do CNPJ; sem rate limit; sem testes; sem migrations versionadas** |

---

## 1. MUDAR — críticos (bloqueiam produção séria)

1. **Senha do portal B2B** = últimos 4 dígitos do CNPJ (`src/lib/b2b/sessao.ts:27-48`). Quebrável em segundos. → hash PBKDF2 + convite com senha definida pelo cliente.
2. **RBAC não aplicado**: 31 de 44 rotas de API só resolvem `empresaAtualId()`, sem verificar perfil nem sessão. Qualquer usuário logado acessa financeiro. → middleware central de auth + `exigirPerfil()` por rota.
3. **Tenant vulnerável**: `empresaAtualId()` (`src/lib/sessao.ts:11-18`) cai para "primeira empresa do banco" sem cookie e não valida se o usuário pertence à empresa. → amarrar `empresaId` à sessão do usuário, remover fallback.
4. **Webhooks sem verificação de assinatura**: marketplaces (`api/webhooks/marketplaces`) aceita qualquer POST; WhatsApp POST sem `X-Hub-Signature-256`. → validar HMAC por plataforma.
5. **Bot WhatsApp não responde**: a IA gera a resposta mas o envio via Graph API é placeholder (`api/ia/whatsapp/route.ts:55`). → ligar `enviarTexto()` já existente.
6. **Sem rate limiting** no login → brute-force livre. → limiter Redis (5 tentativas/15min).
7. **Erros vazam stack do Prisma** para o cliente nas rotas. → erro genérico + log estruturado.
8. **Sem migrations versionadas** (`db push` only) e **zero testes**. → `prisma migrate` + vitest nos módulos fiscal/financeiro no mínimo.

## 2. MELHORAR — completar o que existe

### Fiscal (para o "100% até fiscal")
- **SPED EFD-ICMS/IPI**: adicionar blocos **E** (apuração), **H** (inventário), **G** (CIAP), **C190**, 0140/0175 completos. Hoje o PVA rejeita o arquivo (`src/lib/contabil/sped.ts`).
- **SPED ECD**: blocos I155, I350, J (demonstrações); fonte deve ser partidas dobradas (ver contábil).
- **EFD-Contribuições**: M200/M600 têm zeros hardcoded (crédito/ajustes) — completar apuração e incluir notas de ENTRADA (hoje só saídas).
- **PGDAS-D**: DAS com código de barras é placeholder (`simples-nacional.ts:165`).
- **DEFIS**: ganhoCapital/saldoCaixa/estoque zerados — puxar do balanço real.
- **Contingência de emissão**: NFC-e offline / EPEC / fallback SAT quando Focus ou SEFAZ caírem — hoje a loja para de vender.
- **Gestão de certificado A1**: UI de upload/senha/validade (mesmo delegando ao Focus, o cadastro no provedor precisa ser gerenciado pelo sistema).
- **Regras fiscais por NCM/UF**: CST/CSOSN/ST hoje são manuais por produto — criar cadastro de regra (NCM × UF origem/destino × regime) que preenche automaticamente. É o que separa ERP fiscal sério de nota que "sai errada".
- **Validação de XML de entrada**: `importar-xml.ts` não valida assinatura/protocolo — aceita nota adulterada.

### Contábil
- **Partidas dobradas automáticas**: venda/compra/baixa devem gerar lançamentos débito/crédito no plano de contas. Hoje DRE/BP são agregação do operacional e o ECD exporta de `MovimentoCaixa` — não sustenta auditoria.

### Operação
- **Atualizar custo médio/última compra ao receber nota** — hoje a margem calcula com custo defasado (impacto direto no MarginGuard e na precificação).
- **Transferência entre lojas**: modelo existe, criar rota + UI.
- **Inventário rotativo**: fluxo de contagem → conferência → ajuste aprovado.
- **Caixa**: UI de abertura/sangria/suprimento/fechamento cego (modelo `MovimentoCaixa` já existe).
- **Trava de desconto por perfil**: MarginGuard alerta mas não veta.
- **Promoções**: motor de aplicação automática no PDV (modelo pronto, lógica ausente).
- **Bloqueio por inadimplência no PDV** (hoje só no B2B).

### Integrações
- **Paginação completa** ML/Shopee/Amazon (hoje sincroniza só os primeiros 50-100) + tratamento de 429/Retry-After.
- **Mensagens Shopee/Amazon/Magalu**: `listarMensagensNaoLidas()` retorna `[]` — OmniInbox só funciona de fato com ML.
- **Webhook Pix** (`/api/webhooks/pix`): sem ele não há confirmação automática de pagamento.
- **Agente local do PDV**: TEF/SAT/impressora/balança apontam para `127.0.0.1:6090x` — falta construir/empacotar o executável (Electron/Node service) que roda na máquina da loja.
- **mTLS nos PSPs Pix**: campo existe mas não é usado — bancos exigem.

## 3. ADICIONAR — visão de especialista em autopeças

1. **Grade de fornecedores** (produto × fornecedor × preço × prazo) + cotação de compra comparativa. Comprador de autopeças vive disso.
2. **Venda condicional** ("peça em teste"): prática universal no balcão — item sai, com prazo de retorno, sem faturar. Diferencial vs Bling/Tiny.
3. **Registro de venda perdida**: balconista registra a peça que o cliente pediu e não tinha → alimenta sugestão de compra e o StockPredict. Poucos concorrentes têm.
4. **Vendedor por item** (split de comissão em venda de balcão com 2 vendedores).
5. **Lote/validade** (fluidos, baterias, químicos) — flags existem, rastreio não.
6. **Crediário com análise**: score já existe no schema mas nada o calcula — ligar histórico de pagamento + limite dinâmico.
7. **Boleto/DDA** (emissão via PSP) para B2B faturado.
8. **Fluxo orçamento → pedido → venda** com reserva de estoque e follow-up (hoje são só "tipos" de venda).
9. **Compra automática sugerida**: pedido de compra gerado da curva ABC + ruptura preditiva + venda perdida, por fornecedor da grade.
10. **Etiquetas de prateleira/código de barras interno** (impressão em lote).
11. Roadmap IA já previsto: VoiceBalcão, WhatsApp → orçamento → Pix (aproveitar radar-autopecas), CreditSense.

## 4. Ordem de execução recomendada

**Fase 1 — Segurança (1 semana):** itens 1-7 do MUDAR. Sem isso, nada de cliente real.
**Fase 2 — Fiscal compliance (2-3 semanas):** regras NCM/UF, SPED blocos E/H/G/C190, partidas dobradas, custo médio na entrada, validação XML entrada, contingência.
**Fase 3 — Operação de loja (2 semanas):** caixa completo, transferência, inventário, condicional, venda perdida, grade de fornecedores, trava de desconto, promoções.
**Fase 4 — Integrações e escala (2 semanas):** webhooks assinados + Pix, paginação marketplaces, OmniInbox completo, agente local do PDV, testes + CI + migrations.
**Fase 5 — Diferenciais:** boleto, crediário/score, VoiceBalcão, WhatsApp→Pix.
