// Pix Dinâmico — BR Code (EMV QR Code)
// ====================================
// Padrão MN-BR Code (BACEN/EMV Co.). Gera o payload textual que o cliente
// lê com o app do banco para pagar. Suporta:
//   - Pix estático (chave + valor fixo opcional)
//   - Pix dinâmico (com txid + URL de pix payload do PSP)
//
// Cobrança por QR no PDV: o vendedor gera, exibe na tela / imprime via ESC/POS,
// e o webhook do PSP confirma o pagamento.

import crypto from "node:crypto";

interface PixEstatico {
  chave: string;             // CPF/CNPJ/email/telefone/aleatória
  valor?: number;
  beneficiario: string;      // nome do recebedor (até 25 caracteres)
  cidade: string;            // sem acento, até 15 caracteres
  txid?: string;             // identificador (até 25 chars)
  descricao?: string;
}

function tlv(id: string, valor: string): string {
  const len = valor.length.toString().padStart(2, "0");
  return `${id}${len}${valor}`;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  const buf = Buffer.from(payload, "utf-8");
  for (const b of buf) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function normalizar(texto: string, maxLen: number): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .slice(0, maxLen)
    .toUpperCase();
}

export function gerarBrCodePixEstatico(opts: PixEstatico): string {
  const merchantAccount = tlv("00", "br.gov.bcb.pix") + tlv("01", opts.chave);
  const adicional = opts.txid ? tlv("05", opts.txid.slice(0, 25)) : tlv("05", "***");

  let payload = "";
  payload += tlv("00", "01");                                  // Payload Format Indicator
  payload += tlv("01", opts.valor ? "11" : "12");              // 11=use 1x, 12=múltiplos
  payload += tlv("26", merchantAccount);                       // Merchant Account Pix
  payload += tlv("52", "0000");                                // Categoria
  payload += tlv("53", "986");                                 // Moeda BRL
  if (opts.valor) payload += tlv("54", opts.valor.toFixed(2)); // Valor
  payload += tlv("58", "BR");                                  // País
  payload += tlv("59", normalizar(opts.beneficiario, 25));     // Nome
  payload += tlv("60", normalizar(opts.cidade, 15));           // Cidade
  payload += tlv("62", adicional);                             // Additional Data
  payload += "6304";                                           // CRC placeholder
  const crc = crc16(payload);
  return payload + crc;
}

// Pix dinâmico: o payload aponta para uma URL no PSP que retorna o detalhe
// da cobrança (valor, vencimento, descrição). Permite valor e expiração.
export function gerarBrCodePixDinamico(opts: {
  urlPayload: string;        // ex.: "pix.bcb.gov.br/qr/v2/xxxxxxxxx"
  beneficiario: string;
  cidade: string;
  txid: string;
}): string {
  const merchantAccount = tlv("00", "br.gov.bcb.pix") + tlv("25", opts.urlPayload.replace(/^https?:\/\//, ""));
  const adicional = tlv("05", opts.txid.slice(0, 25));

  let payload = "";
  payload += tlv("00", "01");
  payload += tlv("01", "12");
  payload += tlv("26", merchantAccount);
  payload += tlv("52", "0000");
  payload += tlv("53", "986");
  payload += tlv("58", "BR");
  payload += tlv("59", normalizar(opts.beneficiario, 25));
  payload += tlv("60", normalizar(opts.cidade, 15));
  payload += tlv("62", adicional);
  payload += "6304";
  return payload + crc16(payload);
}

// TXID único para cobrança Pix.
export function gerarTxid(prefixo = "AP"): string {
  return (prefixo + crypto.randomBytes(11).toString("hex")).slice(0, 25);
}

// Cliente para PSPs que oferecem API Pix (Banco do Brasil, Bradesco, Sicoob,
// Itaú, Inter, Stark Bank). Padrão Open Finance / Manual Pix BACEN.
// Suporta criação de cobrança imediata (cob) e cobrança com vencimento (cobv).
import axios, { type AxiosInstance } from "axios";

interface CobrancaPixInput {
  txid: string;
  valor: number;
  chave: string;
  cpfCnpjPagador?: string;
  nomePagador?: string;
  descricao?: string;
  expiracaoSegundos?: number;
}

export interface PspPixConfig {
  baseUrl: string;            // ex.: https://api.bb.com.br/pix/v2
  clientId: string;
  clientSecret: string;
  scope?: string;
  certificadoPemPath?: string;
}

export class PspPixClient {
  private token?: string;
  private expiraEm = 0;
  private readonly http: AxiosInstance;

  constructor(private readonly cfg: PspPixConfig) {
    this.http = axios.create({ baseURL: cfg.baseUrl, timeout: 15_000 });
  }

  private async auth(): Promise<string> {
    if (this.token && this.expiraEm > Date.now() + 60_000) return this.token;
    const credentials = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString("base64");
    const { data } = await this.http.post(
      "/oauth/token",
      `grant_type=client_credentials&scope=${this.cfg.scope ?? "cob.write cob.read"}`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );
    this.token = data.access_token;
    this.expiraEm = Date.now() + data.expires_in * 1000;
    return this.token!;
  }

  async criarCobrancaImediata(input: CobrancaPixInput) {
    const token = await this.auth();
    const { data } = await this.http.put(
      `/cob/${input.txid}`,
      {
        calendario: { expiracao: input.expiracaoSegundos ?? 3600 },
        devedor: input.cpfCnpjPagador && input.nomePagador
          ? input.cpfCnpjPagador.length === 11
            ? { cpf: input.cpfCnpjPagador, nome: input.nomePagador }
            : { cnpj: input.cpfCnpjPagador, nome: input.nomePagador }
          : undefined,
        valor: { original: input.valor.toFixed(2) },
        chave: input.chave,
        solicitacaoPagador: input.descricao,
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return data; // contém location, qrcode, e a chave do QR
  }

  async consultarCobranca(txid: string) {
    const token = await this.auth();
    const { data } = await this.http.get(`/cob/${txid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  }

  async gerarQrPng(loc: string) {
    const token = await this.auth();
    const { data } = await this.http.get(`/loc/${loc}/qrcode`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  }
}
