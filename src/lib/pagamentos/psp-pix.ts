// Cliente da API Pix dos PSPs (padrão BACEN: /cob, /cobv, /pix) com mTLS
// =======================================================================
// O Manual de APIs Pix do BCB exige OAuth 2.0 com mTLS (RFC 8705), TLS 1.2+
// e certificado emitido pelo PSP. Até 04/11/2026 o certificado era só
// declarado e nunca usado; aqui ele vira um https.Agent de verdade, usado
// tanto no /oauth/token quanto nas chamadas da API.
//
// Por PSP (padrões abaixo; conferir na homologação de cada banco, as URLs
// de token mudam de tempos em tempos):
//   - efi:    token em {base}/oauth/token, corpo JSON, Basic; certificado .p12
//             https://dev.efipay.com.br/docs/api-pix/credenciais
//   - inter:  token em cdpj.partners.bancointer.com.br/oauth/v2/token, corpo
//             form com client_id/client_secret; certificado .crt + .key
//   - sicoob: token em auth.sicoob.com.br (OpenID), form com client_id; mTLS
//   - bb:     token em oauth.bb.com.br/oauth/token, Basic; app key na query
//   - generico: {base}/oauth/token, form, Basic
// Tudo pode ser sobrescrito por variável de ambiente (PSP_PIX_TOKEN_URL).
//
// Segredos: client secret, chave privada e senha do .p12 nunca vão para log.
// Erros do axios carregam headers (Authorization) — por isso todo erro sai
// daqui reescrito por `erroPspSeguro`, só com status e código de erro.

import fs from "node:fs";
import https from "node:https";
import axios, { type AxiosInstance } from "axios";

export type ProvedorPix = "efi" | "inter" | "sicoob" | "bb" | "generico";

export interface CertificadoMtls {
  cert?: Buffer;
  key?: Buffer;
  pfx?: Buffer;
  passphrase?: string;
  ca?: Buffer;
}

export interface PspPixConfig {
  provedor?: ProvedorPix;
  baseUrl: string; // ex.: https://pix.api.efipay.com.br/v2
  clientId: string;
  clientSecret: string;
  scope?: string;
  tokenUrl?: string;
  // Certificado do cliente (um dos formatos):
  certificadoPemPath?: string;
  chavePemPath?: string;
  certificadoP12Path?: string;
  senhaCertificado?: string;
  caPemPath?: string;
  certificado?: CertificadoMtls; // já carregado (env base64, testes)
  appKey?: string; // BB: developer_application_key
  /** Padrão true. Só desligue para sandbox/mock local. */
  exigirMtls?: boolean;
}

interface CobrancaPixInput {
  txid: string;
  valor: number;
  chave: string;
  cpfCnpjPagador?: string;
  nomePagador?: string;
  descricao?: string;
  expiracaoSegundos?: number;
}

/** Pix recebido, como o PSP devolve em GET /pix/{e2eid} (padrão BACEN). */
export interface PixRecebido {
  endToEndId: string;
  txid?: string;
  valor: string;
  horario?: string;
}

const TOKEN_PADRAO: Record<ProvedorPix, string | null> = {
  efi: null, // {base}/oauth/token
  inter: "https://cdpj.partners.bancointer.com.br/oauth/v2/token",
  sicoob: "https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token",
  bb: "https://oauth.bb.com.br/oauth/token",
  generico: null,
};

export class ErroPsp extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ErroPsp";
  }
}

/** Reescreve um erro do axios sem headers, corpo de requisição nem URL com segredo. */
export function erroPspSeguro(e: unknown, etapa: string): ErroPsp {
  if (axios.isAxiosError(e)) {
    const status = e.response?.status;
    const dados = e.response?.data as { title?: string; error?: string; nome?: string } | undefined;
    const codigo = dados?.title ?? dados?.error ?? dados?.nome ?? e.code ?? "erro";
    return new ErroPsp(`PSP Pix (${etapa}) respondeu ${status ?? "sem resposta"}: ${String(codigo).slice(0, 80)}`, status);
  }
  return new ErroPsp(`PSP Pix (${etapa}) falhou`);
}

function lerArquivo(caminho?: string): Buffer | undefined {
  return caminho ? fs.readFileSync(caminho) : undefined;
}

/** Carrega o certificado do cliente a partir dos caminhos ou do objeto já pronto. */
export function carregarCertificado(cfg: PspPixConfig): CertificadoMtls | null {
  const c: CertificadoMtls = { ...(cfg.certificado ?? {}) };
  if (cfg.certificadoP12Path) c.pfx = lerArquivo(cfg.certificadoP12Path);
  if (cfg.certificadoPemPath) c.cert = lerArquivo(cfg.certificadoPemPath);
  if (cfg.chavePemPath) c.key = lerArquivo(cfg.chavePemPath);
  if (cfg.caPemPath) c.ca = lerArquivo(cfg.caPemPath);
  if (cfg.senhaCertificado) c.passphrase = cfg.senhaCertificado;
  // PEM com cert e chave no mesmo arquivo (comum no Inter/Sicoob).
  if (c.cert && !c.key && c.cert.toString("utf8").includes("PRIVATE KEY")) c.key = c.cert;
  if (c.pfx || (c.cert && c.key)) return c;
  return null;
}

export function criarAgenteMtls(cert: CertificadoMtls): https.Agent {
  return new https.Agent({
    pfx: cert.pfx,
    cert: cert.cert,
    key: cert.key,
    passphrase: cert.passphrase,
    ca: cert.ca,
    minVersion: "TLSv1.2",
    keepAlive: true,
    rejectUnauthorized: true,
  });
}

/** Monta a requisição de token conforme o PSP (pura, testável). */
export function montarRequisicaoToken(cfg: PspPixConfig): {
  url: string;
  corpo: string;
  headers: Record<string, string>;
} {
  const provedor = cfg.provedor ?? "generico";
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const url = cfg.tokenUrl ?? TOKEN_PADRAO[provedor] ?? `${base}/oauth/token`;
  const basic = `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`;
  const scope = cfg.scope ?? "cob.write cob.read pix.read";
  switch (provedor) {
    case "efi":
      return {
        url,
        corpo: JSON.stringify({ grant_type: "client_credentials" }),
        headers: { Authorization: basic, "Content-Type": "application/json" },
      };
    case "inter":
      return {
        url,
        corpo: new URLSearchParams({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          grant_type: "client_credentials",
          scope,
        }).toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      };
    case "sicoob":
      return {
        url,
        corpo: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: cfg.clientId,
          scope,
        }).toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      };
    case "bb":
    case "generico":
    default:
      return {
        url,
        corpo: new URLSearchParams({ grant_type: "client_credentials", scope }).toString(),
        headers: { Authorization: basic, "Content-Type": "application/x-www-form-urlencoded" },
      };
  }
}

const b64 = (v?: string) => (v ? Buffer.from(v, "base64") : undefined);

/**
 * Lê a configuração do PSP das variáveis de ambiente. No Railway não há
 * arquivo persistente: o certificado pode vir em base64 (PSP_PIX_CERT_*_BASE64).
 * Retorna null se faltar o básico (base, client id, secret).
 */
export function configPspDoAmbiente(env: NodeJS.ProcessEnv = process.env): PspPixConfig | null {
  if (!env.PSP_PIX_BASE_URL || !env.PSP_PIX_CLIENT_ID || !env.PSP_PIX_CLIENT_SECRET) return null;
  const provedor = (env.PSP_PIX_PROVEDOR ?? "generico").toLowerCase() as ProvedorPix;
  const certificado: CertificadoMtls = {
    pfx: b64(env.PSP_PIX_CERT_P12_BASE64),
    cert: b64(env.PSP_PIX_CERT_PEM_BASE64),
    key: b64(env.PSP_PIX_KEY_PEM_BASE64),
  };
  return {
    provedor: ["efi", "inter", "sicoob", "bb", "generico"].includes(provedor) ? provedor : "generico",
    baseUrl: env.PSP_PIX_BASE_URL,
    clientId: env.PSP_PIX_CLIENT_ID,
    clientSecret: env.PSP_PIX_CLIENT_SECRET,
    scope: env.PSP_PIX_SCOPE,
    tokenUrl: env.PSP_PIX_TOKEN_URL,
    certificadoPemPath: env.PSP_PIX_CERT_PEM_PATH,
    chavePemPath: env.PSP_PIX_KEY_PEM_PATH,
    certificadoP12Path: env.PSP_PIX_CERT_P12_PATH,
    caPemPath: env.PSP_PIX_CA_PEM_PATH,
    senhaCertificado: env.PSP_PIX_CERT_SENHA,
    certificado,
    appKey: env.PSP_PIX_BB_APP_KEY,
    exigirMtls: env.PSP_PIX_SEM_MTLS !== "1",
  };
}

export class PspPixClient {
  private token?: string;
  private expiraEm = 0;
  private tokenEmVoo?: Promise<string>;
  readonly http: AxiosInstance;
  private readonly agente?: https.Agent;

  constructor(private readonly cfg: PspPixConfig) {
    const cert = carregarCertificado(cfg);
    if (!cert && cfg.exigirMtls !== false) {
      throw new ErroPsp(
        "Certificado do PSP Pix não configurado. O Banco Central exige mTLS: informe o .p12 ou o par .crt/.key do seu banco.",
      );
    }
    this.agente = cert ? criarAgenteMtls(cert) : undefined;
    this.http = axios.create({
      baseURL: cfg.baseUrl,
      timeout: 15_000,
      httpsAgent: this.agente,
      params: cfg.provedor === "bb" && cfg.appKey ? { "gw-dev-app-key": cfg.appKey } : undefined,
    });
  }

  private async auth(): Promise<string> {
    if (this.token && this.expiraEm > Date.now() + 60_000) return this.token;
    // Uma renovação por vez: chamadas simultâneas esperam a mesma promessa.
    this.tokenEmVoo ??= (async () => {
      const req = montarRequisicaoToken(this.cfg);
      try {
        const { data } = await axios.post(req.url, req.corpo, {
          headers: req.headers,
          httpsAgent: this.agente,
          timeout: 15_000,
        });
        this.token = data.access_token as string;
        this.expiraEm = Date.now() + Number(data.expires_in ?? 3600) * 1000;
        return this.token;
      } catch (e) {
        throw erroPspSeguro(e, "token");
      } finally {
        this.tokenEmVoo = undefined;
      }
    })();
    return this.tokenEmVoo;
  }

  private async chamar<T>(etapa: string, fn: (token: string) => Promise<{ data: T }>): Promise<T> {
    const token = await this.auth();
    try {
      return (await fn(token)).data;
    } catch (e) {
      throw erroPspSeguro(e, etapa);
    }
  }

  async criarCobrancaImediata(input: CobrancaPixInput) {
    return this.chamar("cob", (token) =>
      this.http.put(
        `/cob/${input.txid}`,
        {
          calendario: { expiracao: input.expiracaoSegundos ?? 3600 },
          devedor:
            input.cpfCnpjPagador && input.nomePagador
              ? input.cpfCnpjPagador.length === 11
                ? { cpf: input.cpfCnpjPagador, nome: input.nomePagador }
                : { cnpj: input.cpfCnpjPagador, nome: input.nomePagador }
              : undefined,
          valor: { original: input.valor.toFixed(2) },
          chave: input.chave,
          solicitacaoPagador: input.descricao,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      ),
    );
  }

  async consultarCobranca(txid: string) {
    return this.chamar("consulta cob", (token) =>
      this.http.get(`/cob/${encodeURIComponent(txid)}`, { headers: { Authorization: `Bearer ${token}` } }),
    );
  }

  /** GET /pix/{e2eid}: confirma no PSP que o Pix existe, com valor e txid. */
  async consultarPix(endToEndId: string): Promise<PixRecebido> {
    return this.chamar("consulta pix", (token) =>
      this.http.get<PixRecebido>(`/pix/${encodeURIComponent(endToEndId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
  }

  async gerarQrPng(loc: string) {
    return this.chamar("qrcode", (token) =>
      this.http.get(`/loc/${loc}/qrcode`, { headers: { Authorization: `Bearer ${token}` } }),
    );
  }

  /** Token e agente para outros módulos (Pix Automático) usarem o mesmo mTLS. */
  async credenciais() {
    return { token: await this.auth(), httpsAgent: this.agente };
  }
}
