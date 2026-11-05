# Operação de loja de autopeças e CRM: o que o ERP precisa saber

Data: 2026-11-04. **[E]** = evidência com link; **[H]** = hipótese. Frota, ruptura e balcão de vans: ver `radar-autopecas/docs/conhecimento/bi-e-autopecas.md`; WhatsApp: `mercado-e-atendimento.md`.

## 1. Como a loja funciona
- **Canais.** Há três: balcão, telefone/WhatsApp e oficinas. As oficinas compram por WhatsApp e pedem entrega [H].
  - A Cielo lembra que a venda de autopeças mistura produto e serviço na mesma negociação, o que complica a cobrança [E] ([Cielo](https://blog.cielo.com.br/produtos-e-servicos/maquininha-para-autopecas/)).
  - O ERP da Una para autopeças vende "separação das peças antes do pagamento" e consulta de localização no PDV. Isso indica um fluxo de pedido → separação → caixa, diferente do varejo comum [E] ([Una](https://www.unasistemas.com.br/una-erp-para-lojas-de-autopecas/)).
- **Oficina como cliente B2B.** Não achamos número público atual da fatia da receita do varejo que vem de reparadores. O dado mais citado é de 2014 e divide o mercado entre canais, não entre clientes [E] ([O Mecânico, 2014](https://omecanico.com.br/estudo-afirma-que-mercado-brasileiro-de-reposicao-fechou-2014-em-alta/)).
  - Em loja de linha diesel/van, a oficina e o frotista devem pesar mais que o consumidor final. É [H]: medir no próprio cliente com a tag "tipo de cliente".
- **Venda a prazo/faturado.** Prazo de 30 dias por boleto é prática de mercado.
  - A Mecanizou vende para oficinas com boleto de 30 a 90 dias [E] ([Jornal do Brás](https://jornaldobras.com.br/noticia/112917/mecanizou-chega-a-belo-horizonte-com-a-integracao-de-mais-de-1-milhao-de-autopecas)).
- **Condicional.** A peça sai "para teste" e volta se não servir. Não achamos fonte pública que descreva a prática, então é [H] (já listada na auditoria interna, item 2).
- **Garantia e devolução (CDC).** O prazo para reclamar de vício em produto durável é de 90 dias. A política de troca de 7 dias é comercial e não reduz esse direito [E] ([Idec](https://idec.org.br/consultas/dicas-e-direitos/garantia-entenda-os-prazos-para-reclamar-de-produto-com-defeito)).
  - Se o vício não for sanado em 30 dias, o cliente escolhe entre troca, abatimento ou reembolso (art. 18) [E] ([Monitor do Mercado](https://monitordomercado.com.br/noticias/346754-vicio-oculto-veiculo-artigo-26-cdc-lei/)).
  - O Reclame Aqui tem casos típicos: peça vendida errada [E] ([Fast Autopeças](https://www.reclameaqui.com.br/fast-autopecas/peca-cebolinha-vendida-errada_h4D5Llvr8S7tlIhD/)) e recusa de devolução de motor de partida com defeito [E] ([Chucar](https://www.reclameaqui.com.br/chucar-pecas-eletricas/defeito-em-automatico-de-motor-de-partida-e-recusa-de-devolucao-pela-loja_P2gTy_ETQYHHKTpS/)).
  - A peça defeituosa que volta ao fabricante tem regra fiscal própria. Em SP, a isenção de ICMS vale só para concessionária e oficina autorizada [E] ([SEFAZ-SP RC 30924/2024](https://legislacao.fazenda.sp.gov.br/Paginas/RC30924_2024.aspx)).
- **Entrega.** A régua é a da Mecanizou: entrega de 60 a 90 minutos e média de 55 minutos na Grande SP, segundo a própria empresa [E] ([AutoData](https://www.autodata.com.br/noticias/2024/09/30/startup-mecanizou-expande-operacao-com-o-objetivo-de-dobrar-de-tamanho/78187/)). Na loja, a entrega é feita por motoboy próprio ou por app [H].

## 2. Cadeia e compra
- **Elos da cadeia.** São quatro: fabricante, distribuidor/atacadista, varejo e oficina. Em 2014, o atacado tinha cerca de 31% do mercado de reposição e abastecia varejo, oficinas e frotistas [E] ([O Mecânico](https://omecanico.com.br/estudo-afirma-que-mercado-brasileiro-de-reposicao-fechou-2014-em-alta/)).
- **Ranking de distribuidores.** O "Maiores e Melhores em Distribuição" de 2022 ouviu 500 varejistas. A ordem foi: Sama, Embrepar, Real, DPK, Roles, Cobra e Pellegrino [E] ([Novo Varejo ed. 380](https://novovarejoautomotivo.com.br/wp-content/uploads/2022/12/ED-380-site.pdf)).
- **Concentração.** A Stellantis comprou a DPaschoal, dona da DPK, em 01/2024 e virou o maior distribuidor [E] ([Mercado&Consumo](https://mercadoeconsumo.com.br/19/01/2024/noticias/stellantis-compra-dpaschoal-e-se-torna-maior-distribuidor-de-autopecas-na-al/)).
- **Como o lojista compra.** Os canais são:
  - portais B2B: o KDaPeça, da DPK [E] ([O Mecânico](https://omecanico.com.br/dpk-disponibiliza-portal-de-venda-de-pecas-e-servicos-para-varejo/)), e o da PADO [E] ([ABC da Comunicação](https://www.abcdacomunicacao.com.br/pado-lanca-portal-exclusivo-para-varejistas/));
  - pedidos via WhatsApp [E] ([Startupi/B2LIST](https://startupi.com.br/b2list-desenvolve-solucao-ecommerce/));
  - vendedor externo e várias entregas por dia [H].
- **O comprador vive de cotar o mesmo item em 3 ou 4 distribuidores** [H]. Daí a grade de fornecedores da auditoria.

## 3. Estoque
- **Tamanho do catálogo.** Distribuidores de linha completa carregam de 150 mil a 500 mil SKUs. O giro misturado (blended) é estimado em 3 a 8 vezes, puxado para baixo pela cauda longa. São guias de fornecedor, não pesquisa [E fraca] ([Cleverence](https://www.cleverence.com/articles/for-business/automotive-industry-inventory-turnover-ratio-5273/)).
- **Curva ABC.** É a ferramenta padrão nos estudos de caso de microempresas de autopeças. O risco clássico é comprar lote grande sem histórico e criar estoque morto [E] ([UFCG/SIMEP](https://bdtd.ufcg.edu.br/jspui/bitstream/riufcg/31815/1/APLICA%c3%87%c3%83O%20DA%20CURVA%20ABC%20PARA%20PLANEJAMENTO%20DE%20COMPRAS%20-%20ANAIS%20VI%20SIMEP%20ARTIGO%202018.pdf); [UTFPR](https://repositorio.utfpr.edu.br/jspui/bitstream/1/14203/1/PB_COCTB_2017_2_12.pdf)).
- **O que o Sebrae manda acompanhar.** O lead time do fornecedor e o custo do capital parado [E] ([Sebrae](https://datasebrae.com.br/wp-content/uploads/2024/06/Organizacao-e-Controle-de-Estoque-CS11002-3.pdf)).
- **Benchmarks.** **Não há benchmark público confiável de margem bruta, giro ou ruptura para loja de autopeças no Brasil.**
  - O dado de "70% das lojas perdem venda por controle de estoque" (Plansyst) não tem estudo original localizável. Não usar [E fraca] ([Alephee](https://afterdrive.alephee.com/en/blog/inventory-management-auto-parts-key-success-ecommerce)).
  - O After.Lab mede semanalmente abastecimento e faltas (ONDA), mas é pago [E] ([After.Lab](https://novovarejoautomotivo.com.br/wp-content/uploads/2025/05/AFTER.LAB_.pdf)).

## 4. Cadastro: o problema número 1
- **Campos do cadastro.** Um bom cadastro tem:
  - código OEM completo (prefixo e sufixo mudam a peça);
  - código do fabricante e EAN;
  - aplicação (marca, modelo, versão, ano, motor), lado/posição e medidas.
  - Sem isso, a compatibilidade deve ser tratada como "não verificada" [E] ([Effecti](https://effecti.com.br/licitacao-de-autopecas/)).
- **Padrões.** Nos EUA, a aplicação segue o ACES e o produto segue o PIES (Auto Care Association) [E] ([SPS Commerce](https://www.spscommerce.com/community/articles/aces-and-pies-explained-a-primer-on-automotive-catalog-data)).
- **Devoluções.** Fornecedores de dados de aplicação atribuem cerca de 20% das devoluções a dado de aplicação errado. É número de quem vende o serviço, então é direcional [E fraca] ([PCFitment](https://pcfitment.com/blog/fitment-data-validation-reduce-returns/)).
- **Importação por XML.** Pode duplicar produto já cadastrado. O código do fornecedor precisa ser guardado como código auxiliar [E] ([Alterdata/SINF](https://download.projetusti.com.br/sinf/ajuda/Importacao%20de%20NFe.pdf)).
- **Descrições abreviadas** ("PAST FREIO DIANT", "COMB", "RESERV") são a regra nos ERPs legados. O Radar já mantém sinônimos para isso [H, observado no espelho do ERP do cliente].

## 5. CRM com oficinas
- **Fidelidade de fabricante.** Os fabricantes fidelizam o mecânico com pontos:
  - Bosch eXtra, que se diz o maior programa B2B para oficinas e em que a oficina sobe o XML da NF para pontuar [E] ([Mecânica Online](https://mecanicaonline.com.br/2019/04/extra-bosch-lanca-programa-de-fidelidade-exclusivo-para-oficinas/));
  - Dayco, com 20 mil mecânicos inscritos [E] ([O Mecânico](https://omecanico.com.br/programa-de-fidelizacao-dayco-atinge-20-mil-mecanicos-inscritos/));
  - ZM, que pontua por QR na embalagem [E] ([O Mecânico](https://omecanico.com.br/zm-lanca-programa-de-fidelidade-para-mecanicos/));
  - Monroe Club, com mais de mil revendas [E] ([O Mecânico](https://omecanico.com.br/programa-da-monroe-conta-com-mais-de-mil-revendas-no-pais)).
  - Ou seja: **o mecânico já é disputado com pontos. A loja disputa com prazo, entrega e acerto** [H].
- **Concorrência de plataforma.** A Mecanizou (mais de 3 mil oficinas, cerca de 7 mil buscas por dia, busca por placa) disputa a mesma oficina [E] ([Jornal do Brás](https://jornaldobras.com.br/noticia/112917/mecanizou-chega-a-belo-horizonte-com-a-integracao-de-mais-de-1-milhao-de-autopecas)). Ela captou US$ 14,5 mi na Série A [E] ([Startups](https://startups.com.br/rodada-de-investimento/mecanizou-levanta-us-145-mi-para-levar-tecnologia-ao-setor-de-autopecas/)).
- **Indicadores de carteira** (frequência, ticket, dias sem comprar, mix): sem benchmark setorial [H].

## 6. Indicadores e dores
- **O que se publica.** Andap/Sicap e Sincopeças publicam pouco número aberto. Em 2026, renovaram as diretorias [E] ([Novo Varejo 489](https://novovarejoautomotivo.com.br/wp-content/uploads/2026/02/DIGITAL-489_compressed-1.pdf)).
  - O Sindipeças publica a frota circulante e a projeção da indústria (alta de 4% em 2026) [E] ([MarkLines](https://www.marklines.com/en/news/337620)).
- **Dores com ERPs.** No Reclame Aqui aparecem:
  - suporte que não responde [E] ([TotalERP](https://www.reclameaqui.com.br/totalerp/suporte-nao-responde-problemas-pos-implantacao-e-falhas-de-seguranca_FdUuJqqsoTBCZf4r/));
  - lentidão que impede faturar [E] ([ERPFlex](https://www.reclameaqui.com.br/erpflex/sistema-instavel-lentoinoperante_9mzFR5OomnL4zfkq/));
  - estoque que não baixa e erro após atualização [E] ([Zucchetti](https://www.reclameaqui.com.br/zucchetti-software-e-sistemas/erros-no-erp-apos-atualizacao-e-falta-de-suporte-geram-inseguranca-operacional_0gpjt_LFGnTwqN5Z/));
  - comissão calculada à mão por falta de função [E] ([Nomus](https://www.reclameaqui.com.br/nomus-software/erp-nomus-nao-cumpre-o-prometido-em-relacao-a-comissoes-e-oferece-suporte-precario-com-longas-esperas-por-retorno-impactando-o-calculo-manual-de-comissoes-por-dois-anos_qbWd3zo2QlSVhJ9F/)).
  - Amostra pequena e não específica de autopeças.

## 7. Linha diesel leve e vans
- **Peça importada e genuína.** Cerca de 90% do portfólio de peças da Mercedes no Brasil é importado. A marca cortou até 50% do preço de 100+ itens da Sprinter contra o paralelo [E, dado da montadora] ([AutoPapo](https://autopapo.com.br/curta/pecas-da-mercedes-benz-sprinter-agora-custam-a-metade-a-fim-de-emplacar-vendas-da-van/)).
- **Conferência do código.** Os catálogos de reposição pedem para confirmar o código original em Sprinter, Ducato e Daily [E] ([DS](https://www.ds.ind.br/media/downloads/document/56/e5/1a/Catalogo_Pesado.pdf)).
- **Clientes da linha.** Frotista com van parada perde receita: prazo e crédito pesam mais que preço [H].

## O que isso muda para o AutoPeças ERP
1. **Cadastro com qualidade medida.** Campos obrigatórios: OEM, código do fabricante, EAN, aplicação (modelo/motor/ano), lado/posição e medidas. Um selo "aplicação verificada / não verificada" e um painel de qualidade de cadastro (% de SKUs sem OEM, sem aplicação ou duplicados).
2. **Busca de balcão por qualquer código ou abreviação.** OEM, código de concorrente, sinônimo ("COMB" = combustível) e veículo/motor; alerta "confirme o motor" nos modelos que confundem (HR 8V x 16V). Na entrada por XML, gravar o código do fornecedor como auxiliar sem duplicar SKU.
3. **Fluxo pedido → separação → caixa → entrega.** Status por pedido, motoboy atribuído, horário de saída e chegada, e relatório de tempo médio de entrega contra a régua de 55 a 90 minutos.
4. **Condicional como documento próprio.** Cliente, peças, prazo de retorno, baixa de estoque reservada e conversão em venda ou retorno com um clique, mais um alerta de condicional vencida.
5. **RMA com motivo obrigatório.** Motivos: peça errada (cadastro), peça errada (balcão), defeito/garantia CDC de 90 dias ou desistência. O prazo legal é calculado da data da entrega, e o relatório "devolução por motivo × SKU × vendedor" alimenta a correção do cadastro.
6. **Ficha da oficina (CRM B2B).** Limite de crédito, prazo, fechamento quinzenal ou mensal, boleto, vendedor responsável, frequência, ticket, dias sem comprar e categorias que deixou de comprar. Alerta de churn quando passa de 1,5× o intervalo médio dela [H a calibrar].
7. **Grade de fornecedores e cotação de compra.** SKU × distribuidor × preço × prazo × última entrega. A cotação é enviada por WhatsApp ou e-mail e as respostas são comparadas lado a lado.
8. **Venda perdida no balcão.** Botão "não tínhamos", que registra o código pedido e o cliente e entra na sugestão de compra junto com a curva ABC e a cobertura em dias.
9. **Relatório de estoque parado.** Itens sem venda há 90, 180 ou 365 dias, com valor imobilizado e ação sugerida (devolver ao distribuidor, promoção ou condicional para oficina parceira).

## Fontes
- Cielo: https://blog.cielo.com.br/produtos-e-servicos/maquininha-para-autopecas/
- Una Sistemas: https://www.unasistemas.com.br/una-erp-para-lojas-de-autopecas/
- O Mecânico (estudo 2014): https://omecanico.com.br/estudo-afirma-que-mercado-brasileiro-de-reposicao-fechou-2014-em-alta/
- Jornal do Brás (Mecanizou BH): https://jornaldobras.com.br/noticia/112917/mecanizou-chega-a-belo-horizonte-com-a-integracao-de-mais-de-1-milhao-de-autopecas
- AutoData (Mecanizou): https://www.autodata.com.br/noticias/2024/09/30/startup-mecanizou-expande-operacao-com-o-objetivo-de-dobrar-de-tamanho/78187/
- Startups (Mecanizou Série A): https://startups.com.br/rodada-de-investimento/mecanizou-levanta-us-145-mi-para-levar-tecnologia-ao-setor-de-autopecas/
- Idec (garantia): https://idec.org.br/consultas/dicas-e-direitos/garantia-entenda-os-prazos-para-reclamar-de-produto-com-defeito
- Monitor do Mercado (art. 18/26 CDC): https://monitordomercado.com.br/noticias/346754-vicio-oculto-veiculo-artigo-26-cdc-lei/
- Reclame Aqui (Fast Autopeças, Chucar, TotalERP, ERPFlex, Zucchetti, Nomus): links no texto
- SEFAZ-SP RC 30924/2024: https://legislacao.fazenda.sp.gov.br/Paginas/RC30924_2024.aspx
- Novo Varejo ed. 380 (Maiores e Melhores 2022): https://novovarejoautomotivo.com.br/wp-content/uploads/2022/12/ED-380-site.pdf
- Novo Varejo ed. 489: https://novovarejoautomotivo.com.br/wp-content/uploads/2026/02/DIGITAL-489_compressed-1.pdf
- After.Lab: https://novovarejoautomotivo.com.br/wp-content/uploads/2025/05/AFTER.LAB_.pdf
- Mercado&Consumo (Stellantis/DPK): https://mercadoeconsumo.com.br/19/01/2024/noticias/stellantis-compra-dpaschoal-e-se-torna-maior-distribuidor-de-autopecas-na-al/
- O Mecânico (KDaPeça/DPK): https://omecanico.com.br/dpk-disponibiliza-portal-de-venda-de-pecas-e-servicos-para-varejo/
- ABC da Comunicação (PADO): https://www.abcdacomunicacao.com.br/pado-lanca-portal-exclusivo-para-varejistas/
- Startupi (B2LIST): https://startupi.com.br/b2list-desenvolve-solucao-ecommerce/
- Cleverence (giro): https://www.cleverence.com/articles/for-business/automotive-industry-inventory-turnover-ratio-5273/
- UFCG e UTFPR (curva ABC): links no texto
- Sebrae (controle de estoque): https://datasebrae.com.br/wp-content/uploads/2024/06/Organizacao-e-Controle-de-Estoque-CS11002-3.pdf
- Alephee (dado Plansyst, não verificado): https://afterdrive.alephee.com/en/blog/inventory-management-auto-parts-key-success-ecommerce
- Effecti (identificação de peça): https://effecti.com.br/licitacao-de-autopecas/
- SPS Commerce (ACES/PIES): https://www.spscommerce.com/community/articles/aces-and-pies-explained-a-primer-on-automotive-catalog-data
- PCFitment: https://pcfitment.com/blog/fitment-data-validation-reduce-returns/
- SINF (importação NF-e): https://download.projetusti.com.br/sinf/ajuda/Importacao%20de%20NFe.pdf
- Bosch eXtra: https://mecanicaonline.com.br/2019/04/extra-bosch-lanca-programa-de-fidelidade-exclusivo-para-oficinas/
- Dayco, ZM e Monroe (O Mecânico): links no texto
- MarkLines (Sindipeças 2026): https://www.marklines.com/en/news/337620
- AutoPapo (Sprinter): https://autopapo.com.br/curta/pecas-da-mercedes-benz-sprinter-agora-custam-a-metade-a-fim-de-emplacar-vendas-da-van/
- DS catálogo pesado: https://www.ds.ind.br/media/downloads/document/56/e5/1a/Catalogo_Pesado.pdf
