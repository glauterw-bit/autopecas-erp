// DECISÃO DO DONO: texto de contrato e preço. Troque aqui; a página lê só deste arquivo.
// Não existe valor de preço na página de propósito.
export const CONTRATO = {
  // Decidido: teste de 14 dias (TRIAL_DIAS=14).
  teste: "Teste grátis por 14 dias, com os dados da sua loja importados.",
  // Existe a exportação dos dados da loja (/api/lgpd/exportar).
  exportacao: "Você pode exportar os dados da sua loja quando quiser.",
  // Regra implementada: com mensalidade atrasada o PDV segue vendendo, com aviso.
  // Os prazos de aviso e de somente leitura são configuráveis (.env), por isso não aparecem em dias.
  atraso:
    "Se a mensalidade atrasar, o balcão continua vendendo e você recebe um aviso na tela. Só quando o atraso se prolonga é que o cadastro passa a ser somente leitura.",
  // PROPOSTA (não decidida): texto de preço.
  preco: "Preço sob consulta, transparente e sem taxa escondida por usuário ou por nota.",
  // Ausência de fidelidade/multa é só proposta, por isso NÃO é afirmada na página.
} as const;
