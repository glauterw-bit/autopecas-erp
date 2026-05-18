// Tipos compartilhados pelos adaptadores de marketplace.
// Mantemos um shape neutro para que o restante do sistema não dependa
// dos detalhes de cada plataforma.

export interface AnuncioRemoto {
  itemIdExterno: string;
  titulo: string;
  preco: number;
  precoOriginal?: number;
  estoque: number;
  status: "ATIVO" | "PAUSADO" | "ENCERRADO" | "REJEITADO" | "EM_REVISAO";
  url?: string;
  tipoListagem?: string;
  compatibilidadesUniversal?: boolean;
  compatibilidades?: Array<{
    montadora: string;
    modelo: string;
    versao?: string;
    anoInicio?: number;
    anoFim?: number;
  }>;
}

export interface PedidoRemoto {
  pedidoIdExterno: string;
  status: string;
  valorTotal: number;
  valorFrete: number;
  feeMarketplace: number;
  dataPedido: Date;
  comprador: { nome: string; documento?: string; email?: string; telefone?: string };
  itens: Array<{ itemIdExterno: string; titulo: string; quantidade: number; precoUnitario: number }>;
  enderecoEntrega?: {
    logradouro: string;
    numero?: string;
    bairro?: string;
    cidade: string;
    uf: string;
    cep: string;
  };
  payloadOriginal: unknown;
}

export interface MensagemRemota {
  conversaIdExterno: string;
  remetente: string;
  texto: string;
  recebidaEm: Date;
}

export interface AdaptadorMarketplace {
  plataforma: string;
  listarAnuncios(): Promise<AnuncioRemoto[]>;
  listarPedidosRecentes(): Promise<PedidoRemoto[]>;
  listarMensagensNaoLidas(): Promise<MensagemRemota[]>;
  atualizarEstoque(itemIdExterno: string, quantidade: number): Promise<void>;
  atualizarPreco(itemIdExterno: string, preco: number): Promise<void>;
  enviarMensagem(conversaIdExterno: string, texto: string): Promise<void>;
}
