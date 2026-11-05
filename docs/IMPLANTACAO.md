# Implantação: como colocar uma loja no AutoPeças ERP

Guia para a loja piloto (vans e utilitários diesel, Taboão da Serra/Cotia) e para as próximas.
Regra de ouro: **nada vai para a loja de verdade sem a conferência aprovada pelo dono.**

## O que já existe no sistema

- **Importador por planilha (CSV)**: tela em *Configurações → Implantação* (só ADMIN) ou o script `scripts/importar-csv.ts`.
  Importa produtos, preços, estoque por depósito, clientes, fornecedores e contas a receber em aberto.
- **Leitura do espelho do Radar**: `scripts/importar-radar.ts`. Lê `erp_produtos`, `erp_precos`, `erp_estoque`, `erp_vendas` (só para achar o preço de tabela), `erp_clientes` e `erp_fornecedores`, **somente leitura**.
- Tudo tem **simulação** (lê, mostra o plano e o relatório, não grava), **validação linha a linha** e **relatório de conferência**.
- **Rodar de novo não duplica.** Produto é reconhecido pelo código interno, fornecedor pelo CNPJ, cliente e título pela chave do sistema antigo (tabela `importacao_chaves`).
- O estoque inicial entra pelo **kardex**: um `MovimentoEstoque` de ajuste com origem `SALDO_INICIAL` e um `LogAuditoria` com antes e depois. Na segunda vez, a diferença é zero e nada é gravado.
- **Proteção depois da virada:** se o produto já vendeu, comprou ou passou por inventário no ERP, o importador não mexe no saldo nem no custo médio dele (aparece como "bloqueado"). Título que já foi recebido no ERP também não é alterado.

## Ordem de importação

1. Fornecedores
2. Produtos (com códigos, NCM, marca e preços)
3. Preços (se vierem num arquivo separado)
4. Estoque por depósito
5. Clientes
6. Contas a receber em aberto (precisam dos clientes)

## Mapa de campos (origem → ERP)

### Espelho do Radar (ERP antigo da loja piloto)

| Origem | Vai para | Observação |
|---|---|---|
| `erp_produtos.cd_produto` | Produto: código interno (`sku`) | chave da importação |
| `erp_produtos.descricao` | Produto: nome | descrições abreviadas do ERP antigo ("PAST FREIO DIANT SPRINTER 415 13/") entram como estão |
| `erp_produtos.texto` | Produto: descrição | |
| `erp_produtos.fabricante` | Produto: código do fabricante | no espelho esse campo é o **código**, não a marca |
| `erp_produtos.marca` | Marca | cria a marca se não existir |
| `erp_produtos.status` | Produto: ativo | "A" = ativo |
| `erp_produtos.peso` | Produto: peso (kg) | |
| `erp_produtos.preco_venda` | Produto: **preço mínimo** | o ERP antigo devolve o preço mínimo nesse campo (ver `radar-autopecas/docs/erp-capacidades.md`) |
| último `erp_vendas.vl_unit_tabela` faturado em 120 dias | Produto: **preço de venda** | sem venda recente, o preço de venda fica igual ao mínimo, e o relatório conta quantos ficaram assim |
| `erp_produtos.preco_custo` | Produto: custo médio | |
| `erp_estoque.qt` por `cd_almoxarifado` | Estoque no depósito "Almoxarifado N" | negativo entra como zero, com aviso |
| `erp_estoque.unidade` | Produto: unidade | |
| `erp_clientes.cd_cliente`, `nome`, `cpf_cnpj`, `fones` | Cliente | celular vai para WhatsApp; CPF/CNPJ inválido entra sem documento, com aviso |
| `erp_fornecedores` | Fornecedor | sem CNPJ/CPF válido não entra (o CNPJ é a chave) |

**O que o espelho não traz e precisa vir de outro lugar:**
- **NCM, CEST e EAN.** Sem NCM o produto não pode sair em nota. Peça ao fornecedor do ERP antigo (Azure Sistemas) uma exportação com NCM e EAN, ou importe os XMLs de compra.
- **Aplicação veicular estruturada** (montadora, modelo, ano, motor). O importador guarda a aplicação em texto na descrição. A estruturação é um trabalho seguinte.
- **Contas a receber.** O procedimento 3 (contas a receber) não é sincronizado pelo Radar. Exporte do ERP antigo em CSV.
- **Endereço e e-mail de clientes.** O espelho guarda só nome, documento e telefones.
- **Família → categoria** e **fornecedor do produto** ainda não são levados.

### Planilha (CSV)

Na tela, cada campo do ERP mostra uma lista com as colunas do seu arquivo. O sistema já sugere pelo nome da coluna.
- Números: `1.234,56` ou `1234.56`. O formato `1.234` é recusado porque é ambíguo.
- Datas: `dd/mm/aaaa` ou `aaaa-mm-dd`.
- Contas a receber: informe o **saldo em aberto**, não o valor original do título.
- Forma: "boleto", "cheque", "carteira" etc. O que não for reconhecido entra como crediário (carteira), com aviso.
- Planilha do Excel: *Salvar como → CSV (separado por ponto e vírgula)*. Arquivo em Latin-1 do Windows é aceito.

## Como rodar

```bash
# 1. Criar a empresa (uma vez)
npx tsx scripts/nova-empresa.ts --razao "..." --cnpj ... --uf SP --admin-nome "..." --admin-email ...

# 2. Simular a partir do espelho do Radar (não grava nada)
RADAR_DATABASE_URL=postgresql://...  DATABASE_URL=postgresql://... \
  npx tsx scripts/importar-radar.ts --empresa <CNPJ> --usuario <email do admin>

# 3. Aplicar
  ... --aplicar

# 4. CSV de uma entidade
npx tsx scripts/importar-csv.ts --empresa <CNPJ> --entidade CONTA_RECEBER --arquivo titulos.csv [--mapa mapa.json] [--aplicar]
```

Opções do Radar: `--almoxarifados 1,3` (só os da loja), `--filial-preco 1`, `--entidades produtos,estoque`, `--pagina 1000`.
Se a origem não estiver nesta máquina, o script exige `--origem-remota-ok`. Isso existe para ninguém apontar sem querer para o banco de produção do Radar.

**Cuidado com o banco do Radar em produção:** ele atende clientes. A leitura é feita em páginas de 1.000 linhas, cada uma numa transação curta e somente leitura, com limite de 15 s por consulta. Mesmo assim, rode **fora do horário da loja** e combine com o dono antes. O ideal é ler de uma cópia (`pg_dump` só das tabelas `erp_*`), e não do banco em produção.

## Relatório de conferência

Cada execução vira um lote, e o relatório pode ser baixado em CSV pela tela, com os erros e avisos linha a linha. Ele mostra:
- linhas lidas, válidas, com erro e com aviso;
- o plano: quanto vai ser criado, atualizado, o que fica sem mudança e o que fica bloqueado;
- **produtos**: quantos estão sem NCM, sem EAN, sem marca, sem preço e sem custo;
- **estoque**: total de peças, valor do estoque a custo, separado por depósito;
- **contas a receber**: total em aberto, valor vencido e número de clientes;
- depois de aplicar: o mesmo total lido de volta do ERP e se **bate** com a origem. Diferença nunca é escondida.

O dono confere três números contra o sistema antigo: **quantidade de produtos ativos, valor do estoque a custo e total a receber**.

## Checklist de virada

### Antes (2 a 3 semanas)
- [ ] Empresa criada com CNPJ, IE, regime tributário e endereço corretos (*Configurações*).
- [ ] Certificado digital A1 da loja enviado ao Focus NFe; token configurado; ambiente em **homologação**.
- [ ] Série e numeração da NF-e e da NFC-e continuando de onde o sistema antigo parou (pergunte ao contador).
- [ ] CSC da NFC-e cadastrado (gerado no site da Sefaz-SP).
- [ ] Contador revisou o cadastro fiscal dos produtos (NCM, CST/CSOSN, CFOP). Na dúvida, o sistema bloqueia a nota e explica.
- [ ] Notas de teste emitidas e aprovadas **em homologação**. Nunca em produção.
- [ ] Usuários criados, um por pessoa, com o perfil certo (caixa, vendedor, estoquista, financeiro, gerente).
- [ ] Agente do PDV instalado no computador do caixa; impressora, leitor e gaveta testados.
- [ ] Primeira importação simulada, aplicada num banco de teste e conferida pelo dono.

### Treinamento por papel (1 hora cada, na semana anterior)
- **Balcão/vendedor:** achar peça por código, código do fabricante, descrição e placa; orçamento; venda; "não tínhamos".
- **Caixa:** abrir caixa, receber (dinheiro, Pix, cartão, crediário), sangria, fechar caixa, NFC-e, o que fazer se a internet cair.
- **Estoquista:** entrada de nota por XML, conferência, transferência entre depósitos, inventário.
- **Financeiro:** contas a receber e a pagar, baixa, crediário e limite, conciliação.
- **Dono/gerente:** relatórios, margens, quem pode dar desconto, como ler o relatório de conferência.

### Véspera (dia D − 1, depois de fechar a loja)
- [ ] Último fechamento de caixa no sistema antigo.
- [ ] Reimportação com os dados do fim do dia (produtos, preços, clientes, contas a receber). Como não duplica, é só rodar de novo.
- [ ] **Estoque**: o ideal é contar os itens da curva A e importar o saldo contado. Para o resto, vale o saldo do sistema antigo.
- [ ] Conferência dos três números com o dono: produtos ativos, estoque a custo, total a receber. Assinar e guardar o relatório.

### Dia D
- [ ] Abrir o caixa no ERP novo. A primeira venda é acompanhada de perto.
- [ ] Primeira NFC-e e primeira NF-e conferidas com o contador no mesmo dia.
- [ ] Sistema antigo continua aberto **só para consulta**. Não vender por ele, para o estoque não divergir.
- [ ] Alguém da implantação fica na loja o dia todo.

### Primeira semana
- [ ] Todo dia, comparar o caixa do ERP com o dinheiro na gaveta e com o extrato do cartão e do Pix.
- [ ] Corrigir cadastro conforme o balcão reclamar (sem NCM, preço errado, descrição ruim).
- [ ] Contar o estoque de 20 itens por dia e acertar por inventário.

## Contingência

| Problema | O que fazer |
|---|---|
| Internet, Sefaz ou Focus fora | A NFC-e em contingência offline e a fila de vendas no agente do PDV ainda estão em construção (aposta 5 da estratégia). Até lá: anote a venda (talão numerado), emita a nota assim que voltar e combine o procedimento com o contador **antes** do dia D. |
| Preço errado no cadastro | Corrigir no produto. A alteração fica registrada na auditoria. |
| Estoque não bate | Fazer inventário do item. Não reimportar a origem depois que a loja já vendeu pelo ERP (o importador bloqueia isso de propósito). |
| Importação parou no meio | Rodar de novo. O que já entrou não duplica, e o resto completa. |

## Como voltar atrás

- **Antes do dia D**: não há risco. Simulação não grava nada; se a importação de teste ficou ruim, apague a empresa de teste e comece de novo.
- **Depois do dia D, se for preciso voltar ao sistema antigo:**
  1. Decidir até o fim do primeiro dia, se possível. Quanto mais tempo passa, mais coisa precisa ser lançada de volta.
  2. Exportar do ERP as vendas, os recebimentos e as entradas feitas desde a virada (relatórios de vendas e financeiro).
  3. Lançar essas vendas e recebimentos no sistema antigo, ou ajustar o estoque dele por inventário.
  4. As notas fiscais emitidas pelo ERP **continuam válidas**. Não cancele nota só por trocar de sistema. Avise o contador da numeração usada.
  5. Desligar o acesso dos usuários ao ERP para ninguém vender pelos dois.
- Os dados da implantação ficam marcados: os movimentos de estoque com origem `SALDO_INICIAL` e o número do lote, as chaves do sistema antigo em `importacao_chaves`, e cada execução em `importacao_lotes` com o relatório.

## LGPD

- O arquivo com CPF/CNPJ e contas a receber é dado pessoal. Mantenha-o só na máquina de quem faz a implantação e **apague no fim**.
- As mensagens de erro e o relatório mostram o documento mascarado.
- Só o perfil ADMIN acessa a tela de implantação.

## Pendências para a loja real

- Exportação com NCM, CEST e EAN (ou os XMLs de compra) do ERP antigo.
- Exportação das contas a receber em aberto (procedimento 3 do ERP antigo, ou relatório em CSV).
- Decidir com o dono quais almoxarifados são da loja e o nome de cada depósito.
- Decidir com o dono quando ler o espelho do Radar (fora do horário) ou gerar uma cópia só das tabelas `erp_*`.
- Confirmar que a migração `20261104130000_implantacao` subiu no deploy (cria `importacao_lotes` e `importacao_chaves`).
