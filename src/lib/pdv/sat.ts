// SAT-CF-e (modelo 59) — Sistema Autenticador e Transmissor de Cupons Fiscais
// ===========================================================================
// Equipamento físico instalado no PDV que emite o CF-e (substitui a NFC-e em
// alguns estados, principalmente SP). Comunica-se via USB com a "DLL SAT" e
// retorna o XML autenticado.
//
// Em sistema web/cloud, o "Agente Local PDV" expõe um HTTP local com:
//   /api/sat/enviar-cfe      — autentica e envia
//   /api/sat/consultar       — consulta status do SAT
//   /api/sat/cancelar/{chv}  — cancela CF-e (até 30 min)

import axios from "axios";

export interface InputCfeSat {
  cnpjEmitente: string;
  ieEmitente: string;
  cnpjCpfDestinatario?: string;
  itens: Array<{
    codigo: string;
    descricao: string;
    ncm: string;
    cfop: string;
    unidade: string;
    quantidade: number;
    valorUnitario: number;
    cstIcms: string;
    aliquotaIcms?: number;
  }>;
  pagamento: { codigo: string; valor: number }[];
}

export interface RetornoCfeSat {
  status: "EMITIDO" | "REJEITADO";
  chave: string;
  xml: string;
  mensagem: string;
  qrCode: string;
}

export class SatLocalClient {
  constructor(private readonly baseUrl = "http://127.0.0.1:60907") {}

  async enviarCfe(input: InputCfeSat): Promise<RetornoCfeSat> {
    const { data } = await axios.post(`${this.baseUrl}/api/sat/enviar-cfe`, input, {
      timeout: 30_000,
    });
    return data as RetornoCfeSat;
  }

  async consultar(): Promise<{ ativo: boolean; numeroSessao: number; modelo: string }> {
    const { data } = await axios.get(`${this.baseUrl}/api/sat/consultar`);
    return data;
  }

  async cancelarCfe(chave: string): Promise<{ cancelado: boolean }> {
    const { data } = await axios.post(`${this.baseUrl}/api/sat/cancelar`, { chave });
    return data;
  }
}
