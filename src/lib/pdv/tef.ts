import axios from "axios";

// TEF — Transferência Eletrônica de Fundos
// =========================================
// Integração com PinPad (SiTef da Software Express é o padrão de mercado).
// O SiTef expõe um servidor TEF local na rede do PDV; o front do PDV
// chama esse servidor para iniciar a transação. O PinPad físico mostra
// o valor, lê o cartão (chip/tarja/contactless) e devolve autorização.
//
// Quando o sistema rodar na nuvem (este caso), a comunicação com o PinPad
// é feita via "Agente TEF" instalado no PDV — aplicação local que escuta
// em http://127.0.0.1:porta e fala com o servidor SiTef.
//
// Bandeiras suportadas: Visa, Mastercard, Elo, Hipercard, Amex, Pix, etc.

export interface InicioTransacaoTef {
  valor: number;                           // em centavos
  cupom: string;                           // identificador da venda no ERP
  formaPagamento: "DEBITO" | "CREDITO" | "PIX" | "VOUCHER";
  parcelas?: number;                       // 1..12
  financiadoPor?: "ESTABELECIMENTO" | "ADMINISTRADORA";
  cnpjLojista: string;
}

export interface RetornoTransacaoTef {
  autorizado: boolean;
  nsu: string;                             // Número Sequencial Único
  autorizacao: string;
  bandeira: string;
  bin: string;
  ultimosDigitos: string;
  parcelas: number;
  comprovanteCliente: string;
  comprovanteEstabelecimento: string;
  mensagem: string;
}

export class AgenteTefClient {
  constructor(private readonly baseUrl = "http://127.0.0.1:60906") {}

  // Inicia uma venda no PinPad. Bloqueia até o cliente passar/aprovar o cartão.
  async iniciarVenda(req: InicioTransacaoTef): Promise<RetornoTransacaoTef> {
    const { data } = await axios.post(
      `${this.baseUrl}/api/tef/venda`,
      {
        valor: req.valor,
        documento: req.cupom,
        forma: req.formaPagamento,
        parcelas: req.parcelas ?? 1,
        financiamento: req.financiadoPor ?? "ESTABELECIMENTO",
        cnpj: req.cnpjLojista,
      },
      { timeout: 120_000 },
    );
    return data as RetornoTransacaoTef;
  }

  async cancelar(nsu: string): Promise<{ ok: boolean }> {
    const { data } = await axios.post(`${this.baseUrl}/api/tef/cancelamento`, {
      nsu,
    });
    return data;
  }

  // Confirma a transação no SiTef (after-the-fact confirmation requerida em
  // certas integrações). Sem confirmar, a transação é desfeita após timeout.
  async confirmar(nsu: string) {
    await axios.post(`${this.baseUrl}/api/tef/confirmar`, { nsu });
  }

  // Pix do PinPad: gera QR Code no display ou imprime.
  async iniciarPix(valor: number, cupom: string): Promise<RetornoTransacaoTef> {
    const { data } = await axios.post(`${this.baseUrl}/api/tef/pix`, { valor, documento: cupom });
    return data as RetornoTransacaoTef;
  }
}
