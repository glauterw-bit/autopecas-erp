> **Status: referência, NÃO aprovada.** O dono vai definir os preços depois (05/11/2026). Nada aqui vale até ele decidir.

# Preços e planos do AutoPeças ERP (proposta de 05/11/2026)

Status: PROPOSTA. Nenhum preço vale até o dono aprovar. Nada foi commitado.
Legenda: [E] fonte oficial aberta em 05/11/2026; [secundária] fonte que não é do fornecedor; [H] hipótese minha, a confirmar.

## 1. Recomendação em 3 linhas

1. Três planos com tudo incluído (usuários, NF-e/NFC-e, IA com teto): Balcão R$ 199, Loja R$ 349, Rede R$ 749 por mês. No anual, 2 meses grátis.
2. Sem fidelidade, reajuste só pelo IPCA uma vez por ano com 60 dias de aviso, teste de 14 dias, garantia de 30 dias. Implantação cobrada, mas só na virada, e grátis no anual.
3. Preço de fundador (20% menos, travado por 24 meses) para as 5 primeiras lojas, e só começar a cobrar depois de fechar os bloqueadores 1 a 5 da auditoria. O produto ainda não tem loja operando, então o preço é um palpite a validar.

## 2. Planos

| | BALCAO (Balcão) | LOJA (Loja) | REDE (Rede) |
|---|---|---|---|
| Mensal | R$ 199 | R$ 349 | R$ 749 |
| Anual (2 meses grátis, 16,7% de desconto) | R$ 1.990 (R$ 165,83/mês) | R$ 3.490 (R$ 290,83/mês) | R$ 7.490 (R$ 624,17/mês) |
| Usuários | 3 | 6 | 15 |
| Lojas (CNPJ) | 1 | 1 | 3 |
| Depósitos | 1 | 2 | 5 |
| NF-e + NFC-e por mês (incluídas) | 300 | 800 | 2.000 |
| Produtos cadastrados | 20.000 | 60.000 | 150.000 |
| IA (teto de custo por mês) | US$ 3 | US$ 8 | US$ 20 |
| Marketplaces | não | Mercado Livre (beta) | Mercado Livre, Shopee, Amazon e Magalu (beta) |
| Portal B2B das oficinas | não | não | sim (beta) |
| Contábil (DRE, balanço, SPED) | não | não | sim (beta, não serve para entrega oficial) |

Os limites de produtos (20 mil, 60 mil, 150 mil) são palpite [H]. A busca ainda não foi medida com 50 mil produtos (auditoria, bloqueador 11). Não prometer esses tetos antes do teste de carga.

Todos os planos incluem: PDV, caixa, estoque, compras, fiscal, financeiro, aplicação veicular com busca rápida, venda perdida, qualidade de cadastro, CRM de oficina com alerta de churn, importador de implantação.

**Para quem é**
- Balcão: loja pequena, 1 CNPJ, vende no balcão e não tem marketplace.
- Loja: o plano principal. Loja de linha leve ou diesel/vans com marketplace ligado. É o plano provável da loja piloto [H: confirmar se ela usa ML].
- Rede: 2 ou 3 CNPJs, ou loja que atende oficinas pelo portal.

**O que NÃO está incluído**
- Certificado digital A1 (a loja compra; o Bling vende por R$ 79).
- WhatsApp e Radar: são outro produto. Preço do pacote junto fica para depois [H].
- TEF, maquininha e PinPad (contrato da loja com a adquirente).
- Telas que ainda não existem: app nativo, voz. Não vendemos o que está em desenvolvimento.
- Nenhum módulo beta é cobrado à parte. Ele vem marcado "beta" na tela e no contrato.

**Regras de uso (proposta)**
- **Usuário extra:** R$ 25/mês [H, o custo para nós é quase zero]. Oficina que entra pelo B2B e o contador (perfil só de leitura) não contam como usuário [H: o perfil do contador ainda precisa ser criado].
- **CNPJ adicional:** R$ 149/mês em qualquer plano, com mais 500 notas. Cobre o custo da Focus (R$ 62,90 por CNPJ). Para comparar: SOFTClass cobra R$ 100 [E].
- **Nota acima do limite:** R$ 0,25 por nota [H]. Aviso aos 80%. O sistema nunca bloqueia a emissão: nota parada é loja parada. Cobra na fatura seguinte.
- **IA no teto:** a IA para até o mês seguinte (o balcão segue normal) e o dono vê o aviso. Aumento do teto sob pedido, com preço a definir [H].
- **Atraso:** o prazo de bloqueio por falta de pagamento é decisão do dono (auditoria, item 9). Sugestão: avisar com 10 dias, só leitura aos 20, nunca apagar dados.

## 3. Implantação

Recomendo cobrar, mas só quando a loja começar a vender pelo sistema (virada). Se a implantação falhar, não cobra. Motivo: uma queixa citada no Reclame Aqui é cobrança integral por implantação que falhou (https://www.reclameaqui.com.br/e-millennium/cobranca-integral-e-rescisao-sem-uso-do-erp-da-com-falha-na-implantacao-e-falta-de-comunicacao_qYXXCZE9facuaAlt/).

| Plano | Implantação (uma vez) | Se contratar anual |
|---|---|---|
| Balcão | R$ 490 | grátis |
| Loja | R$ 990 | grátis |
| Rede | R$ 1.990 | grátis |

Inclui: importação de cadastro, estoque, preço e clientes com relatório de conferência; configuração fiscal (certificado A1, série, CSC, regime); 2 sessões de treinamento de 2 horas; acompanhamento na primeira semana de venda.
Horas internas [H]: 6 h (Balcão), 10 h (Loja), 20 h (Rede), a R$ 40/h [H] = R$ 240, R$ 400 e R$ 800. A cobrança cobre o custo e deixa pouca sobra.

Mercado [E, https://www.bling.com.br/planos-e-precos, https://www.vhsys.com.br/planos-e-precos, https://actana.com.br/sistema-para-auto-pecas]: Bling cobra R$ 300 por 2 h (opcional). vhsys diz que não tem adesão. Actana promete migração e treinamento grátis. Lexos e Linx não publicam. Cobrar é defensável porque a nossa implantação é mais ampla (importa estoque e aplicação veicular), mas é o ponto mais sensível ao preço da Actana e do vhsys.

Atenção: o importador e a tela de configuração fiscal por loja ainda não estão prontos (auditoria, bloqueador 6). Enquanto for à mão, a implantação custa mais horas do que as estimadas [H].

## 4. Contrato

- **Fidelidade:** nenhuma. Mensal cancela quando quiser, vale até o fim do ciclo pago. Só o vhsys bianual tem fidelidade (24 meses) [E], e multa e aviso prévio longo são queixas comuns no setor.
- **Anual:** pago adiantado. Cancelou nos primeiros 30 dias: devolve tudo. Depois: não devolve o já pago, e avisa por e-mail 30 dias antes de renovar.
- **Reajuste:** uma vez por ano, no aniversário do contrato (nunca no primeiro ano), pelo IPCA dos 12 meses (IBGE), com aviso por escrito 60 dias antes. Sem aumento por faturamento ou por volume de nota. Conta Azul tem reclamação de reajuste sem aviso (https://www.reclameaqui.com.br/contaazul/aumento-abusivo-de-mensalidade-na-renovacao-automatica-e-desrespeito-ao-cliente-antigo_Z1LoOcSWUyT36ITG/). O texto final precisa de advogado (auditoria, bloqueador 5).
- **Teste grátis:** 14 dias, com os dados da loja importados. Notas reais no teste: até 50 [H]; acima disso, só homologação. A Focus dá 30 dias de teste [E, https://focusnfe.com.br/precos/]. Concorrentes: Bling 30 dias, GestãoClick 10, vhsys 7, Actana 10, Conta Azul 3 [E].
- **Garantia:** 30 dias de dinheiro de volta após a primeira cobrança (a Actana também dá 30) [E].
- **Saída:** exportação dos dados da loja em até 30 dias após cancelar (ainda não existe no sistema; auditoria, bloqueador 5).

**Lançamento e fundador**
- **Piloto (Taboão/Cotia):** 60 dias sem mensalidade, a partir do dia em que as notas reais saírem pelo sistema. Depois entra no preço de fundador. Em troca: reunião de 30 minutos por semana e dados de uso. Custo para nós: cerca de R$ 105 a R$ 185 por mês de custo variável (seção 5), mais as horas.
- **Fundador (5 lojas, incluindo a piloto):** 20% de desconto, travado por 24 meses (Balcão R$ 159, Loja R$ 279, Rede R$ 599). Condição: assinar até 30/06/2027 [H, data a decidir], feedback mensal de 30 minutos, e deixar citar o nome da loja só com autorização por escrito. Sem fidelidade. A 6ª loja em diante paga a tabela.
- **Quando começar a cobrar:** só depois dos itens 1 a 5 de "Para vender em 30 dias" (vazamento entre empresas, dependências críticas, promessas falsas, hospedagem, contrato e LGPD). A própria auditoria diz que eles são condição para cobrar de qualquer loja, inclusive a piloto.

## 5. Margem

### Custos usados (por loja, por mês)

| Custo | Valor | Fonte |
|---|---|---|
| Emissor fiscal Focus NFe, plano Retail: R$ 62,90 por CNPJ, com 500 NFC-e + 100 NF-e; excedente NFC-e R$ 0,055 e NF-e R$ 0,16 | ver contas | [E] https://focusnfe.com.br/precos/ (05/11/2026). Preço de tabela; não sei se existe desconto de revenda [H] |
| Mistura de notas | 70% NFC-e, 30% NF-e | [H] |
| Notas recebidas contam no pacote da Focus? | não considerei | [H] a confirmar com a Focus; se contarem, o custo sobe |
| IA | no pior caso, o teto do plano em dólar | O teto padrão de US$ 20 é regra do sistema. O custo real é menor; uso 30% do teto como cenário esperado [H]. Preço da OpenAI não pesquisado |
| Câmbio | R$ 5,50 por dólar | [H] |
| Hospedagem (app, banco, Redis, worker) | R$ 30 / R$ 40 / R$ 60 por loja | [H] rateio. O custo fixo do Railway não foi levantado. Com poucas lojas o rateio por loja é maior |
| Cobrança pelo Asaas | cartão à vista R$ 0,49 + 2,99%; Pix e boleto R$ 1,99 | [E] https://www.asaas.com/precos-e-taxas (valores lidos em resultado de busca em 05/11/2026). A leitura direta da página mostrou R$ 2,15 e R$ 1,08 sem dizer qual vale. Uso o cartão como pior caso |
| Suporte | 1 h / 2 h / 4 h por mês, a R$ 40/h | [H] |
| Imposto sobre a receita (Simples etc.) | não incluído | confirmar com o contador |

### Contas do Focus
- Balcão: 300 notas cabem no Retail = R$ 62,90.
- Loja: 800 notas (560 NFC-e + 240 NF-e). 60 NFC-e a mais x 0,055 = R$ 3,30; 140 NF-e a mais x 0,16 = R$ 22,40. Total R$ 88,60.
- Rede: 3 CNPJs x R$ 62,90 = R$ 188,70. 2.000 notas (1.400 NFC-e + 600 NF-e): 300 NF-e a mais x 0,16 = R$ 48. Total R$ 236,70.

### Mensal, pior caso (IA no teto, pagamento por cartão)

| | Balcão R$ 199 | Loja R$ 349 | Rede R$ 749 |
|---|---|---|---|
| Focus | 62,90 | 88,60 | 236,70 |
| Hospedagem [H] | 30,00 | 40,00 | 60,00 |
| IA no teto (US$ 3 / 8 / 20 a R$ 5,50) [H] | 16,50 | 44,00 | 110,00 |
| Asaas (cartão) | 6,44 | 10,93 | 22,89 |
| **Custo variável** | **115,84** | **183,53** | **429,59** |
| **Margem bruta (R$ / %)** | **83,16 / 41,8%** | **165,47 / 47,4%** | **319,41 / 42,6%** |
| Suporte [H] | 40 | 80 | 160 |
| Margem depois do suporte | 43,16 / 21,7% | 85,47 / 24,5% | 159,41 / 21,3% |

### Cenário esperado (IA em 30% do teto [H])

| | Balcão | Loja | Rede |
|---|---|---|---|
| Custo variável | 104,29 | 152,73 | 352,59 |
| Margem bruta | 47,6% | 56,2% | 52,9% |
| Depois do suporte | 27,5% | 33,3% | 31,6% |

Anual (preço/12, uma cobrança por ano no cartão, IA no teto, sem suporte): Balcão 31,0%, Loja 37,6%, Rede 31,8%.

Fundador (20% a menos), pior caso, sem suporte: Balcão R$ 159 = 27,9%, Loja R$ 279 = 35,0%, Rede R$ 599 = 29,0%. Com o suporte da Loja (R$ 80) a margem cai para cerca de 6%: o fundador paga o custo e não o tempo. É investimento, não lucro.

Pontos de atenção:
- Os dois maiores custos são a nota fiscal e a IA. Nota é custo certo; IA no teto é o pior caso, não o consumo real. Medir o gasto real de IA por loja nos 60 dias do piloto e rever o teto.
- A Focus tem planos para muitas lojas: Retail+ R$ 657,90 (CNPJs ilimitados, 9.000 NFC-e + 1.000 NF-e) e Growth R$ 572 (4.000 documentos, CNPJs ilimitados) [E]. Perto de 10 lojas, trocar de plano baixa o custo por loja. Pendente: ver se o contrato da Focus permite usar uma conta para vários clientes (revenda) [H].
- Imposto e taxa de maquininha da loja não entram.

## 6. Comparativo (1 loja, 4 usuários, 300 notas/mês, Mercado Livre ligado)

| Sistema | Plano que cobre o cenário | Preço/mês | Observação | Fonte |
|---|---|---|---|---|
| **AutoPeças ERP** | Loja | **R$ 349** (fundador R$ 279) | Aplicação veicular, venda perdida, CRM de oficina. Sem loja operando ainda | esta proposta |
| Bling | Titânio | R$ 120 | 50 usuários, NF-e ilimitada, genérico (sem aplicação veicular). Limite de marketplace do Titânio não confirmado [H] | [E] https://www.bling.com.br/planos-e-precos |
| GestãoClick | Ouro | R$ 289 (preço do plano anual) | 5 usuários, 2 lojas. Não lista autopeças. ML não confirmado | [E] https://gestaoclick.com.br/ |
| vhsys | Completo | R$ 359 (anual: 12x R$ 287,20) | 5 usuários, PDV e estoque. ML não confirmado | [E] https://www.vhsys.com.br/planos-e-precos |
| SOFTClass / ERPClass (autopeças) | Omnichannel + usuários | cerca de R$ 300 a R$ 370 | R$ 199,90 + 2 usuários a R$ 50; NF-e R$ 70 à parte fora do Completo. Quantos usuários o plano já inclui não está claro [H] | [E] https://www.softclass.com.br/planos |
| Omie | Multivarejo | a partir de R$ 468 | Usuários ilimitados; o preço sobe com o faturamento | [E] https://www.omie.com.br/precos/ |
| Conta Azul | Avançado | R$ 439,90 (no anual) | 5 usuários; valores inferidos da leitura, confirmar | [E, a confirmar] https://www.contaazul.com/pro/planos/ |
| Actana (autopeças) | único | R$ 49,90 (promoção; de R$ 99,90) | Não cita NFC-e, aplicação veicular nem ML | [E] https://actana.com.br/sistema-para-auto-pecas |

Leitura: o Loja fica no nível do ERPClass (o concorrente de autopeças mais próximo com preço público) e abaixo de Omie e Conta Azul, mas acima de Bling. A diferença para o Bling tem de ser paga por aplicação veicular, venda perdida e CRM de oficina, e isso ainda não foi provado numa loja. Se o piloto achar caro, o primeiro ajuste é o fundador, não a tabela.

## 7. Como validar com a loja piloto e as próximas 5

**Perguntas (loja piloto, antes de mostrar preço)**
1. Quanto a loja paga hoje ao Azure, o que está incluído, tem fidelidade e reajuste? (não achei preço do Azure.)
2. Quantos usuários, quantas notas por mês, quantos produtos e quantos anúncios no ML?
3. Quem decide a troca? O contador influencia? (hipótese do mercado.md, a confirmar)
4. O que mais incomoda hoje: preço, nota que rejeita, falta de peça certa, suporte?
5. Quatro preços (para o plano Loja): a partir de quanto é tão barato que você desconfia? Barato mas ok? Começa a ficar caro? Caro demais?
6. Prefere pagar anual com 2 meses grátis ou mensal sem compromisso?

**Sinais bons:** aceita assinar o fundador por escrito; manda os arquivos para importação em até 1 semana; usa o PDV na semana 2; pergunta de nota e imposto, não só de preço; indica o contador ou outra loja.
**Sinais ruins:** só pergunta se é grátis; volta ao Azure para emitir nota; contador não aprova.

**Funil a medir (teste para pago)**, por loja, em planilha simples:
contato, demonstração, teste iniciado (dados importados), uso real na semana 2 (vendas faturadas no sistema, não orçamento), virada, primeira cobrança paga, 3º mês pago.
Número principal: **de cada 5 lojas que começam o teste, quantas pagam a primeira mensalidade.** Meta de partida: 3 de 5 [H, sem base]. Secundários: dias entre teste e virada; horas de implantação gastas por loja (checa as horas [H]); gasto real de IA por loja; notas emitidas por loja; motivo registrado de quem não fechou.

Teste de preço: mostrar a tabela cheia (Loja R$ 349) a todas e oferecer o fundador (R$ 279) só a quem topar as condições. Se 2 ou mais das 5 recusarem a tabela cheia por preço, testar Loja a R$ 299 com as próximas 5 [H].

## 8. Riscos e hipóteses

- **Sem loja operando.** Cobrar R$ 349 por um produto com módulos em beta é arriscado. Mitigação: fundador, teste grátis, garantia, e rótulo "beta" em tudo que não estiver validado.
- **Promessa falsa.** README e página inicial ainda prometem o que não existe (auditoria, bloqueador 8). Corrigir antes de qualquer material de venda. Este documento não usa depoimento, número de cliente ou "melhor do mercado".
- **Cobrança ainda não existe no sistema** (bloqueador 4); está sendo implementada. Até lá, cobrança à mão.
- **Custos [H]:** hospedagem, suporte, câmbio, mistura de notas, consumo real de IA e regra de contagem de notas da Focus. Revisar após 60 dias do piloto.
- **Focus:** pode não permitir revenda ou exigir condição própria (a página diz que os preços valem para quem concorda com as políticas dela) [E]. Confirmar antes da segunda loja.
- **IA:** a pesquisa diz que gpt-4o e gpt-4o-mini desligam em 14/01/2027 (estrategia.md). Confirmar na página da OpenAI; a troca muda o custo da IA.
- **Concorrentes sem preço:** Lexos, Linx, WinPro, Kplus, MegaPeças, Autcom, Azure. Só se descobre pedindo orçamento como cliente. Pendente.
- **Preços de concorrentes** vêm de páginas lidas em 05/11/2026; Conta Azul e Tiny têm ressalva. Preços mudam.
- **Contador:** a influência na troca é hipótese. Perfil "contador" gratuito só de leitura pode virar canal de indicação, mas ainda não existe.
- **Margem fina depois do suporte** (21% a 25% no pior caso). Se o suporte passar das horas estimadas, o Balcão perde dinheiro.
- **Impostos** sobre a receita não entraram.
- **Limites de produtos** são palpite até o teste de carga.

## 9. Valores para o seed (só depois da aprovação)

Valores em centavos. Ajustar os nomes das colunas ao schema final da cobrança.

| codigo | nome | mensal | anual | usuarios | lojas | depositos | notasMes | produtos | tetoIaUsd | modulos |
|---|---|---|---|---|---|---|---|---|---|---|
| BALCAO | Balcão | 19900 | 199000 | 3 | 1 | 1 | 300 | 20000 | 3 | base |
| LOJA | Loja | 34900 | 349000 | 6 | 1 | 2 | 800 | 60000 | 8 | base, marketplaces (ML) |
| REDE | Rede | 74900 | 749000 | 15 | 3 | 5 | 2000 | 150000 | 20 | base, marketplaces, b2b, contabil |
| INTERNO | Interno | 0 | 0 | sem limite | sem limite | sem limite | sem limite | sem limite | 20 | todos (lojas de teste, sem cobrança) |

Extras (centavos):
- usuarioExtra 2500
- cnpjAdicional 14900 (inclui +500 notas)
- notaExcedente 25
- implantacao: BALCAO 49000, LOJA 99000, REDE 199000 (zero no anual)
- teste: 14 dias, 50 notas reais
- garantia: 30 dias
- aviso de limite: 80%
- reajuste: IPCA, 1 vez por ano, aviso de 60 dias

Preço de fundador (desconto, não plano): cupom FUNDADOR20, 20% por 24 meses, 5 vagas, validade até 30/06/2027 [H]. Resultado arredondado: Balcão 15900, Loja 27900, Rede 59900. O piloto tem 60 dias sem cobrança antes.

`modulos` base inclui PDV, estoque, compras, fiscal, financeiro, catálogo, CRM, venda perdida e IA até o teto. O INTERNO não entra em relatório de receita nem no funil.

Fontes: Focus NFe https://focusnfe.com.br/precos/ ; Asaas https://www.asaas.com/precos-e-taxas ; concorrentes em `docs/conhecimento/precos-concorrentes-2026-11.md`. Lidas em 05/11/2026.
