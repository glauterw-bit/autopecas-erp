# Exclusão de empresa (LGPD) - como rodar

Uso do dono do SaaS, depois de 90 dias do cancelamento. Não roda sozinho.

## Antes
1. Confirme a data do cancelamento e que a loja recebeu a exportação (Configurações → Meus dados, ZIP). O prazo para exportar é 30 dias.
2. Faça backup do banco.
3. Rode a simulação (o padrão): `npx tsx scripts/excluir-empresa.ts --cnpj 11222333000144`. Ela apaga tudo dentro de uma transação e desfaz no fim, então as contagens são exatas e os vínculos do banco também são testados.

## Para valer
`npx tsx scripts/excluir-empresa.ts --cnpj 11222333000144 --cancelada-em AAAA-MM-DD --executar`
O script recusa se faltarem menos de 90 dias e pede para digitar o CNPJ de novo.

## O que apaga
Produtos, aplicações, estoque, kardex, clientes, vendas e itens, contas a receber e a pagar, caixa, compras (pedidos), OS, RMA, comissões, marketplaces, webhooks, importações, IA, Pix recorrente, sessões e usuários. Na linha da empresa, limpa e-mail, telefone, endereço, logo, chave do Vallente e configurações.

## O que mantém (obrigação legal)
- `notas_fiscais` com os XMLs e `notas_entrada`: documento fiscal, 5 anos (CTN arts. 173 e 174).
- `lancamentos_contabeis` e suas partidas; o plano de contas é compartilhado.
- A linha da empresa (razão social, CNPJ, IE) e os fornecedores que têm nota de entrada guardada.
- `aceites_termos` e `logs_auditoria` (prova de conformidade; sem documento completo).
- `assinaturas` e `consumo_notas_mes`: registro comercial da cobrança (plano, datas, ids do Asaas, notas por mês). Decisão de jul/2026 (revisão R5): ficam, para conferir cobranças e contestações; não têm dado pessoal de cliente da loja. Se o jurídico mandar apagar, é só tirar da lista `MANTIDAS` e incluir os dois passos de DELETE.

## Trava de segurança
Se uma tabela nova com `empresaId` ficar com linhas e não estiver na lista de "mantidas" em `src/lib/lgpd/excluir-empresa.ts`, tudo é desfeito com uma mensagem dizendo qual. Ao criar tabela nova com `empresaId`, inclua o passo de exclusão.

## Limites conhecidos
- Conversas de IA sem cliente vinculado não têm como ser ligadas à empresa e não entram na exclusão.
- Passados 5 anos, os documentos fiscais mantidos também precisam ser apagados (ainda não há script para isso).
- Apagar do backup do provedor segue a rotina de retenção dele.
