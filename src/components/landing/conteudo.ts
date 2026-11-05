// Textos da página de vendas. Tudo aqui foi conferido contra o README (matriz
// funciona / beta / em desenvolvimento). Antes de mudar um texto para dizer
// que algo "funciona", confira o código e atualize a matriz do README.
// Contrato e preço (decisão do dono) ficam em ./contrato.ts.
import { CONTRATO } from "./contrato";

export { CONTRATO };

export const NOME_PRODUTO = "AutoPeças ERP";

export const DORES: { titulo: string; problema: string; solucao: string }[] = [
  {
    titulo: "Achar a peça sem saber o código exato",
    problema: "O cliente fala \"FD-123\", o cadastro está como \"FD123\", ou só a descrição abreviada.",
    solucao:
      "A busca ignora traço, ponto e espaço no código (SKU, código de barras, do fabricante ou OEM) e também procura pelas palavras da descrição, no formato abreviado que a loja já usa. O código exato aparece primeiro. Em teste com 50 mil produtos sintéticos, numa máquina de teste, as buscas típicas responderam em cerca de 30 milissegundos ou menos.",
  },
  {
    titulo: "Peça certa para o veículo certo",
    problema: "Vender a pastilha que não serve na van do cliente vira devolução e perda de confiança.",
    solucao:
      "O catálogo é organizado por montadora, modelo, versão e ano, e a busca por aplicação funciona no balcão.",
  },
  {
    titulo: "Venda que escapou",
    problema: "O cliente pediu, a loja não tinha, e ninguém anotou. Na hora de comprar, a loja não sabe o que faltou.",
    solucao:
      "O balcão registra a venda perdida na hora. Há um relatório com o que mais faltou, para orientar a compra.",
  },
  {
    titulo: "Devolução que ensina",
    problema: "A peça volta e o motivo se perde. O erro de cadastro continua lá, esperando o próximo cliente.",
    solucao:
      "A devolução guarda o motivo, e o produto devolvido fica marcado para revisão do cadastro.",
  },
  {
    titulo: "Cadastro em que dá para confiar",
    problema: "Produto sem aplicação, sem código do fabricante ou duplicado atrapalha a busca.",
    solucao:
      "Um painel mostra quanto do cadastro tem aplicação verificada e lista os produtos que precisam de revisão.",
  },
  {
    titulo: "Oficina que sumiu",
    problema: "A oficina que comprava toda semana parou de ligar, e ninguém percebeu.",
    solucao:
      "Uma lista mostra as oficinas em risco de parar de comprar, para a loja chamar antes de perder, e registra quem já foi contatado.",
  },
];

export const FISCAL: { titulo: string; texto: string }[] = [
  {
    titulo: "Fim da ST para autopeças em SP",
    texto:
      "A Portaria SRE 34/2026, da Secretaria da Fazenda de São Paulo, tirou as autopeças da sistemática da substituição tributária (ICMS-ST) a partir de 01/10/2026. O sistema tem um passo de virada para esse ajuste. Confirme o seu caso com o seu contador.",
  },
  {
    titulo: "IBS e CBS na nota",
    texto:
      "Os novos campos da reforma tributária já fazem parte da nota para quem está no regime normal desde 03/08/2026. Para o Simples Nacional, a obrigação vale a partir de 01/01/2027. O suporte no sistema está em beta, e a emissão só deve valer depois de testada em homologação.",
  },
  {
    titulo: "Devolução com a nota de origem",
    texto:
      "Nota de devolução precisa citar a nota original (documento referenciado), exigência valendo desde 03/11/2026. O sistema liga a devolução à venda de origem.",
  },
];

export const MIGRACAO: string[] = [
  "Importador de planilha (CSV) para produtos, preços, estoque por depósito, clientes, fornecedores e contas a receber em aberto.",
  "Simulação antes de gravar: o sistema mostra o que vai entrar e aponta linhas com problema.",
  "Relatório de conferência, para você aprovar antes de a loja usar de verdade.",
  "Pode rodar de novo sem duplicar cadastro.",
  "O estoque inicial entra pelo histórico de movimentos, com registro de antes e depois.",
  "Depois da virada, o importador não mexe no saldo de produto que já vendeu ou foi comprado no sistema.",
];

export const BETA: { titulo: string; status: "Beta" | "Em desenvolvimento"; texto: string }[] = [
  {
    titulo: "Mercado Livre",
    status: "Beta",
    texto:
      "Anúncios, pedidos e compatibilidade de autopeças funcionam em código, mas ainda não foram testados com conta real do Mercado Livre.",
  },
  {
    titulo: "Shopee, Amazon e Magalu",
    status: "Beta",
    texto: "Mesma situação: falta testar com conta real. No Magalu, o envio de mensagem ainda não existe.",
  },
  {
    titulo: "Notas fiscais (NF-e e NFC-e)",
    status: "Beta",
    texto:
      "A emissão acontece ao faturar a venda. Cancelar, corrigir e inutilizar ainda não têm tela. Emitimos em homologação até validar.",
  },
  {
    titulo: "Buscar o veículo pela placa",
    status: "Beta",
    texto: "Mostra marca, modelo e ano. Ainda não filtra as peças compatíveis automaticamente.",
  },
  {
    titulo: "Maquininha, impressora e balança",
    status: "Beta",
    texto: "Falta testar com equipamento real. O leitor de código de barras USB já funciona.",
  },
  {
    titulo: "Portal das oficinas",
    status: "Beta",
    texto: "A oficina vê catálogo, preços, histórico e faturas, mas ainda não faz pedido pelo catálogo.",
  },
  {
    titulo: "App do vendedor externo",
    status: "Em desenvolvimento",
    texto: "Só o leitor por câmera existe. A maior parte das telas ainda não foi feita. Não há app nas lojas de aplicativos.",
  },
  {
    titulo: "WhatsApp no sistema",
    status: "Em desenvolvimento",
    texto: "Ainda não serve para mais de uma loja.",
  },
  {
    titulo: "Foto da peça, peça equivalente e leitura de nota por IA",
    status: "Em desenvolvimento",
    texto:
      "A IA sugere e quem atende confirma. A IA nunca inventa preço nem estoque, que vêm do seu cadastro. A precisão ainda será medida na loja piloto.",
  },
];

export const FAQ: { p: string; r: string }[] = [
  {
    p: "Já tem loja usando?",
    r: "Ainda não. O sistema está em fase de piloto e nenhuma loja opera nele. Por isso esta página diz o que funciona, o que está em teste e o que ainda não existe. Qualquer ganho de tempo ou de venda só será divulgado depois de medido numa loja real.",
  },
  {
    p: "Preciso parar a loja para trocar de sistema?",
    r: "Não é a ideia. Você importa os dados, confere o relatório e só então começa a usar. O importador pode ser rodado várias vezes sem duplicar cadastro.",
  },
  {
    p: "A IA pode errar o preço ou o estoque?",
    r: "Preço e estoque vêm do seu cadastro, nunca da IA. Onde há IA, ela sugere e uma pessoa confirma.",
  },
  {
    p: "Funciona com leitor de código de barras?",
    r: "Sim, leitor USB que funciona como teclado, sem instalar driver. O balcão foi pensado para o teclado.",
  },
  {
    p: "E o SAT?",
    r: "Em São Paulo o SAT acabou em 01/01/2026 (Portaria SRE 79/2024). No balcão, a venda ao consumidor usa NFC-e.",
  },
  {
    p: "Meus dados ficam presos?",
    r: "Não. Você pode exportar os dados da sua loja quando quiser.",
  },
  {
    p: "Quanto custa?",
    r: CONTRATO.preco,
  },
];
