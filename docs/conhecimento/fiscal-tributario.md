# Fiscal e tributário para ERP de autopeças (SP)

**Data:** 2026-11-04 · **Legenda:** [E] = evidência com link · [H] = hipótese ou leitura nossa, a confirmar com o contador.
Nada aqui substitui o contador da loja. Onde a fonte é blog, está dito.

## 1. As 3 mudanças que valem para um cliente de SP em nov/2026

1. **Autopeças saíram da ST em SP em 01/10/2026.** A Portaria SRE 34/2026 revoga o Anexo XIV da Portaria CAT 68/2019 (autopeças) e a Portaria SRE 16/2023 (base de cálculo da saída de autopeças, art. 313-P do RICMS). Também revoga as bases de pneus (SRE 15/24) e de baterias de chumbo (SRE 10/26). O estoque em 30/09 segue a Portaria CAT 28/2020 [E][1]. O Protocolo ICMS 93/2026 tirou SP do Protocolo 41/2008, o interestadual de autopeças (fonte secundária) [E][2]. O CEST continua obrigatório para itens dos anexos do Convênio 142/2018, mesmo sem ST (blog) [E][3].
2. **SAT acabou.** A Portaria SRE 79/2024 incluiu o art. 34-D na Portaria CAT 147/2012, que proíbe emitir CF-e-SAT a partir de 01/01/2026 [E][4]. No varejo de SP vale só a NFC-e (modelo 65). A contingência offline da NFC-e está prevista na Portaria SRE 40/2024 (blog) [E][5].
3. **IBS/CBS na nota: o dever existe, a rejeição ainda não.** O Ato Conjunto RFB/CGIBS nº 4/2026 obriga o destaque de IBS/CBS na NF-e e na NFC-e desde 03/08/2026 para o regime normal. Para o Simples Nacional, a obrigação vale para todos os documentos a partir de 01/01/2027 [E][6]. Mas a NT 2025.002 v1.51/1.52 passou a rejeição em produção por falta do grupo IBSCBS (regra UB12-10, Rej. 1115) para "implementação futura". Em homologação, a rejeição continua para CRT 3 (blog técnico) [E][7].

## 2. Documentos fiscais eletrônicos

- **NF-e 55 / NFC-e 65.** O código atual manda NFC-e no balcão e NF-e nas demais origens (`src/lib/nfe/emissor.ts`). Isso está certo para SP pós-SAT [H].
- **Cancelamento.** NFC-e: até 30 minutos da autorização, pelo Ajuste SINIEF 19/2016, citado em resposta à consulta da SEFAZ-SP [E][8]. NF-e em SP: 24 h. Um parecer de 2012 aceitava pedido até 744 h, com multa de 1% (art. 527 do RICMS). **Não confirmei se essa regra segue vigente** [E][8].
- **CC-e, inutilização, EPEC, SVC-AN/SVC-RS.** São eventos e modos de emissão padrão do MOC. Pela documentação do ACBr: tpEmis 6 = SVC-AN, 7 = SVC-RS, 9 = offline NFC-e [E][5]. **Não confirmei** o prazo de transmissão da NFC-e offline em SP. Fontes de outras UFs falam em 24 h [E][5].
- **Certificado A1.** É obrigatório para a NFC-e. Sem SAT, o ERP responde pelo ciclo inteiro da nota (blogs) [E][4].
- **Notas técnicas vigentes.** A NT 2025.002-RTC chegou à v1.53, publicada em 30/10/2026. Pelo comunicado de 05/10/2026, a homologação de pontos da v1.51/1.52 foi em 26/10 e a produção é em **16/11/2026** [E][7]. A partir de 03/11/2026, a devolução exige referência ao documento por item (`DFeReferenciado`, Rej. 321) [E][7]. **Atenção:** isso afeta o RMA/garantia.

## 3. ICMS em autopeças

- **Antes de 01/10/2026,** a loja varejista era substituída: comprava com ST retida, vendia com CST 60/CSOSN 500 e CFOP 5405, sem ICMS próprio [H, prática conhecida].
- **Depois de 01/10/2026, venda interna em SP:**
  - **Regime normal:** ICMS próprio, com crédito nas entradas. A alíquota interna geral de SP é 18% (o código usa 18; a alíquota por NCM **não foi conferida**).
  - **Simples:** CSOSN de tributação normal (101/102) e CFOP 5102 [H]. As notas de entrada só vêm com ST se tiverem sido emitidas até 30/09/2026 (blog) [E][9].
- **Estoque em 30/09/2026.** Pela leitura da CAT 28/2020 feita em blog [E][3]:
  - **Regime normal:** crédito do ICMS-ST do estoque, lançado no Bloco E com o código **SP020750**, em 12 parcelas.
  - **Simples:** compensação no PGDAS-D.
  - **Quando não dá crédito:** se a entrada não trouxer `vBCSTRet`, o crédito é zero.
  - **Conferir:** o texto da CAT 28/2020 [H].
- **Consequência para o Simples [H]:** a receita de autopeças deixa de ser segregada como "ICMS já pago por ST" no PGDAS-D. O ICMS passa a sair dentro do DAS, e o **DAS sobe**.
- **Venda interestadual a não contribuinte (e-commerce/marketplace).** O DIFAL vai 100% para a UF de destino (LC 190/2022). Cada UF define base única ou dupla e o seu FCP [H]. Hoje `calcularDifal` usa base única e um FCP fixo em código.
- **ST em outras UFs:** a peça pode continuar em ST no destino. A regra precisa ser por NCM × UF × regime, como já apontava a auditoria [H].

## 4. PIS/COFINS monofásico (até 31/12/2026)

- **Regra.** A Lei 10.485/2002 concentra PIS/COFINS no fabricante e no importador dos produtos dos Anexos I e II (posições como 8708 e pneus 4011). Na revenda, a alíquota é zero, com **CST 04** [E][10].
- **Simples.** A receita monofásica é segregada no PGDAS-D e não paga a parcela de PIS/COFINS do DAS, conforme a Solução de Consulta COSIT 204/2019 citada em blog [E][11]. Na prática, isso reduz o DAS da loja em vários pontos percentuais [H].
- **NCM.** Código NCM desdobrado de um item do anexo segue monofásico (blog) [E][11]. O ERP precisa do flag "monofásico" por NCM, não por descrição.
- **2027.**
  - PIS/COFINS são extintos e a CBS entra plena [E][12].
  - A LC 214/2025 prevê regime monofásico para combustíveis. **Não encontrei monofasia de autopeças na CBS** [H].
  - Se for isso: a revenda passa a pagar CBS com crédito das compras, e a vantagem do Simples monofásico some [H].

## 5. IPI

O varejista que só revende não é contribuinte de IPI. O importador direto e o estabelecimento equiparado (art. 9º do RIPI) são [H]. A partir de 2027, o IPI fica com alíquota zero, exceto ZFM [E][12]. O `calcularIpi` só faz sentido para importador e atacadista equiparado.

## 6. Reforma tributária: calendário real

| Período | O que vale | Fonte |
|---|---|---|
| 2026 | CBS 0,9% + IBS 0,1% informativos. Cumprir a obrigação acessória dispensa o recolhimento (Ato Conjunto RFB/CGIBS 1/2025) | [E][12][13] |
| 03/08/2026 | Destaque obrigatório na NF-e/NFC-e para o regime normal. Rejeição em produção suspensa | [E][6][7] |
| 01/09–30/09/2026 | Janela já encerrada: opção do Simples por recolher IBS/CBS "por fora" no 1º semestre de 2027. Desistência até **30/11/2026** | [E][14] |
| 01/11/2026 | ME/EPP do Simples emitem NFS-e só no padrão nacional (Res. CGSN 191/2026) | [E][15] |
| 16/11/2026 | Produção da NT 2025.002 v1.51/1.52 (monofasia, VC02-50) | [E][7] |
| 01/01/2027 | CBS plena e fim do PIS/COFINS. IPI zero. Simples destaca IBS/CBS em todos os documentos | [E][6][12] |
| 2027 | Alíquota de referência da CBS: o TCU calculou 11,3468% (arredondada para 11,3%) em 28/10/2026. O Senado fixa até 15/12/2026. **Não definitiva** | [E][16] |
| 2027–2028 | Split payment voluntário em 2027; obrigatório previsto para 2028 (fonte secundária, citando a RFB) | [E][17] |

**Campos na NF-e:**
- grupo `IBSCBS` por item, com CST e `cClassTrib`;
- totais `IBSCBSTot`;
- notas de crédito e de débito (`tpNFCredito` e `tpNFDebito`).

A tabela de `cClassTrib` sai no Portal NF-e. **Não baixei a tabela vigente** [E][7].

## 7. SPED e declarações

- **Simples em SP.** Está dispensado da EFD ICMS/IPI (Protocolo ICMS 03/2011), mas pode aderir voluntariamente. Entrega a **DeSTDA** pelo SEDIF-SN (Portaria CAT 23/2016), exceto MEI [E][18]. Quem estoura o sublimite sai da DeSTDA e vai para a EFD (blog) [E][18].
- **Lucro Presumido/Real:**
  - **EFD ICMS/IPI, todo mês:** C100/C170/C190, E110 (apuração), H010 (inventário) e G (CIAP).
  - **Na virada da ST:** Bloco H com motivo 02 e Bloco E com SP020750 [E][3].
  - **EFD-Contribuições:** CST 04 nas saídas monofásicas.
  - **Anuais:** ECD e ECF [H, regra geral].
- **PVA.** Todo arquivo precisa passar no validador antes de entregar. A auditoria de jul/2026 registrou rejeição; hoje `sped.ts` já gera C190, E100/E110, G e H. **Não validei no PVA** [H].

## 8. Emissão: API terceira x emissor próprio

| Opção | Preço publicado | Prós | Contras |
|---|---|---|---|
| Focus NFe (atual) | Solo R$ 94,90/mês: 1 CNPJ, 100 docs, R$ 0,11 por excedente. **Retail (NFC-e) R$ 62,90/mês: 500 NFC-e + 100 NF-e**, R$ 0,055 por NFC-e excedente. Growth R$ 572/mês, CNPJs ilimitados [E][19] | Cuida do certificado, da fila e das NTs; tem NFS-e | Custo por CNPJ; depende de terceiro para contingência |
| NFE.io | Plano Base de R$ 190 ou R$ 220/mês, conforme a página (conflitante) [E][20] | API simples | Preço não confirmado |
| Nuvem Fiscal, Webmania, PlugNotas, eNotas | **Não confirmei preço** (site fora do ar ou bloqueado) | — | — |
| ACBr / emissor próprio | Software livre [H] | Sem custo por nota; contingência local | Assinatura XML, webservices de 27 UFs, cada NT por nossa conta |

**Recomendação [H]:** manter a Focus (plano Retail por loja) até ter escala. Emissor próprio só com equipe fiscal dedicada.

## 9. NFS-e (oficina)

- **Prazo.** Desde 01/11/2026, ME/EPP do Simples emitem só no padrão nacional (Res. CGSN 191/2026, que adiou a data de setembro) [E][15].
- **Municípios.** **Não confirmei** a situação de Taboão da Serra e Cotia no Ambiente de Dados Nacional.
- **IBS/CBS.** A NFS-e de serviços da LC 116 entra no cronograma IBS/CBS em 01/10/2026 (resumo de terceiros, divergente) [E][6].

## 10. Erros mais comuns em autopeças [H, prática de mercado]

- **NCM genérico ou inválido.** O código manda `"00000000"` quando falta o NCM, e a nota é rejeitada.
- **CEST ausente** em item do Conv. 142.
- **ST errada pós-outubro.** O produto ficou com CST 60/CSOSN 500 e CFOP 5405 depois de 01/10.
- **PIS/COFINS fixo.** A nota sai com CST 07 em vez de 04 em item monofásico.
- **DIFAL sem a regra da UF de destino.**
- **Devolução sem referência por item** (Rej. 321 desde 03/11/2026).
- **Certificado A1 vencido.**

## O que o ERP precisa ter em 2026-2027

| Item | Prazo | Hoje |
|---|---|---|
| Grupo IBS/CBS + cClassTrib por item | Regime normal: já. Simples: 01/01/2027 | Falta |
| Regra fiscal NCM × UF × regime (CST/CSOSN, CFOP, MVA, CEST, monofásico) | Já | Manual por produto |
| Migração pós-ST de SP (CSOSN/CFOP e estoque de 30/09) | Já | Falta |
| Crédito do estoque com ST (CAT 28/2020): relatório, Bloco H motivo 02, E111 SP020750 | Já | Falta |
| NFC-e offline + EPEC/SVC para NF-e | Já | Falta |
| Devolução com `DFeReferenciado` por item | 03/11/2026 | Falta |
| Gestão de certificado A1 com alerta de validade | Já | Falta |
| DeSTDA (Simples) / EFD validada no PVA | Mensal | Parcial |
| NFS-e padrão nacional (oficina) | 01/11/2026 | Conferir `nfse.ts` |
| CBS plena, fim do PIS/COFINS, IPI zero, apuração com crédito | 01/01/2027 | Falta |
| Split payment no recebimento (Pix/cartão) | 2027 voluntário, 2028 previsto | Falta |

## O que isso muda para o AutoPeças ERP

1. **`src/lib/nfe/emissor.ts`**:
   - `pis_situacao_tributaria: "07"` e `cofins_situacao_tributaria: "07"` estão fixos no código. Precisam vir da regra fiscal: 04 para monofásico; Simples conforme o contador.
   - O código não manda o grupo IBS/CBS. Incluir até 01/01/2027 para o Simples e já para o Presumido.
2. **`emissor.ts`, fallback de NCM:** o padrão `ncm ?? "00000000"` gera rejeição. É melhor bloquear a venda com mensagem clara.
3. **Migração de cadastro pós-01/10/2026:** um script que leva os produtos de SP de CST 60/CSOSN 500 com CFOP 5405 para tributação normal, mantendo o CEST.
4. **Tela "Virada da ST":** posição do estoque em 30/09/2026 × `vBCSTRet` das entradas (já importadas em `src/lib/nfe/importar-xml.ts`). Gera o crédito da CAT 28/2020, o Bloco H motivo 02 e o E111 SP020750 em `src/lib/contabil/sped.ts`, além do valor para o PGDAS-D.
5. **`src/lib/fiscal/calculo.ts`:**
   - `calcularItemFiscal` aplica ST sempre que há `mvaSt`. Em SP, autopeças não têm mais MVA interna.
   - `calcularPisCofins` ignora o monofásico no Presumido/Real.
   - `calcularDifal` não trata base dupla, e o FCP está fixo no código.
   - Trocar tudo por uma tabela de regras versionada por data de vigência.
6. **`src/lib/fiscal/simples-nacional.ts`:**
   - Segregar a receita monofásica (sem PIS/COFINS) e a receita com ST (até 30/09/2026).
   - Em 2027: CBS/IBS dentro do DAS, ou "por fora" se a loja optou. A desistência vai até 30/11/2026.
7. **Devolução/RMA:** referenciar a NF-e original por item (Rej. 321 desde 03/11/2026).
8. **Contingência:** NFC-e offline (tpEmis 9) com fila de retransmissão e EPEC/SVC para NF-e. Hoje, se a Focus ou a SEFAZ cai, o balcão para.
9. **Plano 2027:** apuração de CBS com crédito das compras (o fim do monofásico encarece a revenda [H]) e preparo para o split payment no `/api/webhooks/pix`.
10. **Custo:** a Focus Retail (R$ 62,90/mês por CNPJ com 500 NFC-e) cabe no preço do SaaS. Emissor próprio (ACBr) não é prioridade.

## Fontes

1. Portaria SRE 34/2026, SEFAZ-SP: https://legislacao.fazenda.sp.gov.br/Paginas/Portaria-SRE-34-de-2026.aspx · ANDAP: https://andap.org.br/portaria-sre-34-exclusao-das-autopecas-da-sistematica-da-st-em-sao-paulo/
2. Protocolo ICMS 93/2026: https://www.substituicaotributaria.com/SST/substituicao-tributaria/noticia/15/09/2026/confaz-exclui-sao-paulo-do-protocolo-icms-de-autopecas
3. CLM Controller, fim da ST de autopeças em SP: https://clmcontroller.com.br/en/tributos/fim-do-icms-st-para-autopecas-em-sao-paulo-o-que-muda/
4. Portaria SRE 79/2024: https://legislacao.fazenda.sp.gov.br/Paginas/Portaria-SRE-79-de-2024.aspx · https://blog.tecnospeed.com.br/sat-nfce/
5. Contingência NFC-e SP (Portaria SRE 40/2024): https://inventti.com.br/?p=21127 · ACBr: https://www.projetoacbr.com.br/forum/topic/93366-conting%C3%AAncia-nfc-e-como-manter-as-vendas-no-ar-quando-a-sefaz-cai/
6. Ato Conjunto RFB/CGIBS nº 4/2026: https://www.cgibs.gov.br/upload/arquivos/202607/31091735-20260730-16h30-ato-conjunto-rfb-cgibs-na-c2-ba-4-260731-090909.pdf · https://www.machadomeyer.com.br/pt/inteligencia-juridica/publicacoes-ij/tributario-ij/rfb-e-cgibs-definem-cronograma-oficial-de-obrigatoriedade-dos-documentos-fiscais-eletronicos-com-ibs-e-cbs
7. NT 2025.002 v1.51–1.53: https://www.tax360.com.br/conteudo/nt-nfe-nfce-2025-002-rtc-v152 · Portal NF-e: https://www.nfe.fazenda.gov.br/portal/
8. Cancelamento: https://legislacao.fazenda.sp.gov.br/Paginas/RC30118_2024.aspx · https://www.legisweb.com.br/legislacao/?id=266384
9. Notas de entrada após 01/10/2026: https://consulcamp.com.br/2026/07/10/portaria-sre-no-34-2026-exclusao-de-novas-mercadorias-do-regime-de-substituicao-tributaria-icms-sp/
10. Lei 10.485/2002: https://www2.camara.leg.br/legin/fed/lei/2002/lei-10485-3-julho-2002-464514-normaatualizada-pl.pdf
11. Monofásico no Simples: https://tributodevido.com.br/portal/tributacao-pis-cofins-monofasica-autopecas-simples-nacional/ · https://tributodevido.com.br/portal/desdobramento-de-codigos-ncm-para-autopecas-sujeitas-a-tributacao-monofasica/
12. Transição 2026–2027: https://www.reformatributaria.com/iva/cbs-sera-de-943-em-2027-mas-pode-cair-para-694-em-2030-com-split-payment-projeta-roit/
13. Ato Conjunto RFB/CGIBS nº 1/2025: https://www.legisweb.com.br/legislacao/?id=488401 · https://sefaz.es.gov.br/Noticia/ato-conjunto-da-receita-federal-e-comite-gestor-do-ibs-define-obrigacoes-acessorias-para-ibs-e-cbs-em-2026
14. Opção do Simples por IBS/CBS: https://blog.econeteditora.com.br/simples-nacional-2027-prazo-de-opcao-muda-para-setembro-de-2026-e-exige-decisao-sobre-ibs-e-cbs/ · Manual RFB: https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/Manual%20op%C3%A7%C3%A3o%20regime%20regular%20IBS%20e%20CBS%20no%20Simples%20Nacional.pdf
15. Res. CGSN 191/2026: https://documentacao.senior.com.br/exigenciaslegais/noticias/federal/2026/2026-08-11-simples-nacional-resolucao-cgsn-no-191-2026-utilizacao-do-emissor-da-nfs-e-de-padrao-nacional-sera-a-partir-de-novembro
16. TCU, CBS 2027: https://www.legisweb.com.br/noticia/?id=34652 · https://www.migalhas.com.br/quentes/467494/tcu-aprova-calculo-de-referencia-para-cbs-especialistas-analisam
17. Split payment em 2028: https://documentacao.senior.com.br/exigenciaslegais/noticias/federal/2026/2026-09-03-reforma-tributaria-split-payment-obrigatoriedade-fica-para-2028-confirma-receita-federal
18. Simples em SP, EFD e DeSTDA: https://portal.fazenda.sp.gov.br/servicos/simples/Paginas/destda.aspx · https://legislacao.fazenda.sp.gov.br/Paginas/RC31561_2025.aspx
19. Preços Focus NFe (consultados em 04/11/2026): https://focusnfe.com.br/precos/
20. Preços NFE.io: https://nfe.io/precos/emissao-nfe
