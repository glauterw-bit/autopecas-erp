import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({ get: vi.fn(), request: vi.fn() }));
vi.mock("axios", () => ({ default: http }));

import { cifrar, decifrar } from "../cripto";
import { aplicarRespostaFocus, enviarEmpresaFocus, mensagemErroFocus, payloadEmpresaFocus, testarConfiguracaoFocus } from "./focus-empresas";

const K = Buffer.alloc(32, 6).toString("base64");
const ENV = { APP_ENCRYPTION_KEY: K };
const EMPRESA = {
  razaoSocial: "Auto Peças Teste Ltda", nomeFantasia: null, cnpj: "12.345.678/0001-95", inscEstadual: "123456789012",
  inscMunicipal: null, regimeTributario: "SIMPLES_NACIONAL", logradouro: "Rua A", numero: "1", complemento: null,
  bairro: "Centro", municipio: "Cotia", uf: "SP", cep: "06700-000", telefone: null,
  configuracoes: {
    fiscal: {
      focus: { ambiente: "homologacao", serieNfe: "1", serieNfce: "2", proximoNumeroNfce: 151, tokenHomologacao: cifrar("tok-h", ENV) },
      nfce: { cscHomologacao: cifrar("CSC-H", ENV), idTokenHomologacao: "000001" },
    },
  },
};

beforeEach(() => vi.clearAllMocks());

describe("payload da API de empresas da Focus", () => {
  it("campos conforme doc.focusnfe.com.br/reference/atualizar_empresa", () => {
    const p = payloadEmpresaFocus(EMPRESA, { base64: "UEZY", senha: "s" }, ENV);
    expect(p).toMatchObject({
      cnpj: "12345678000195", regime_tributario: 1, cep: "06700000", habilita_nfe: true, habilita_nfce: true,
      serie_nfe_homologacao: "1", serie_nfce_homologacao: "2", proximo_numero_nfce_homologacao: "151",
      csc_nfce_homologacao: "CSC-H", id_token_nfce_homologacao: "000001",
      arquivo_certificado_base64: "UEZY", senha_certificado: "s",
    });
    expect(p).not.toHaveProperty("csc_nfce_producao");
    expect(p).not.toHaveProperty("proximo_numero_nfe_homologacao");
    expect(payloadEmpresaFocus({ ...EMPRESA, regimeTributario: "LUCRO_REAL" }, null, ENV).regime_tributario).toBe(3);
  });

  it("sem token de revenda: explica e não chama a Focus", async () => {
    const r = await enviarEmpresaFocus(EMPRESA, { env: ENV });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensagem).toMatch(/painel da Focus/);
    expect(http.request).not.toHaveBeenCalled();
  });

  it("cria (POST) e guarda os tokens devolvidos cifrados", async () => {
    http.request.mockResolvedValue({ status: 200, data: { id: 77, token_homologacao: "novo-h", token_producao: "novo-p", certificado_valido_ate: "2027-04-01T15:03:25-03:00" } });
    const r = await enviarEmpresaFocus(EMPRESA, { env: { ...ENV, FOCUS_NFE_TOKEN_REVENDA: "rev" }, certificado: { base64: "UEZY", senha: "s" } });
    expect(http.request).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", url: "https://api.focusnfe.com.br/v2/empresas", auth: { username: "rev", password: "" } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const f = aplicarRespostaFocus({}, r.resposta, new Date("2026-11-05T12:00:00Z"), ENV);
    expect(f.focus?.empresaIdFocus).toBe("77");
    expect(decifrar(f.focus!.tokenProducao!, ENV)).toBe("novo-p");
    expect(f.certificado).toMatchObject({ origem: "focus", validoAte: "2027-04-01T18:03:25.000Z" });
  });

  it("422 da Focus vira mensagem em português sem ecoar a senha", () => {
    const m = mensagemErroFocus(422, { codigo: "erro_validacao", erros: [{ campo: "arquivo_certificado_base64", mensagem: "verifique a senha" }] });
    expect(m).toBe("A Focus recusou os dados: certificado: verifique a senha");
    expect(mensagemErroFocus(401, "HTTP Basic: Access denied")).toMatch(/recusou o token/);
  });
});

describe("Testar configuração (homologação, sem emitir)", () => {
  it("sem token: diz o que falta e não chama a Focus", async () => {
    const r = await testarConfiguracaoFocus({ cnpj: "1", configuracoes: null }, ENV);
    expect(r.ok).toBe(false);
    expect(r.etapas[0].mensagem).toMatch(/Falta o token de homologação/);
    expect(http.get).not.toHaveBeenCalled();
  });

  it("404 nao_encontrado na consulta = token aceito; usa a URL de homologação", async () => {
    http.get.mockResolvedValue({ status: 404, data: { codigo: "nao_encontrado" } });
    const r = await testarConfiguracaoFocus(EMPRESA, ENV);
    expect(r.ok).toBe(true);
    expect(http.get.mock.calls[0][0]).toMatch(/^https:\/\/homologacao\.focusnfe\.com\.br\/v2\/nfe\/teste-configuracao-/);
    expect(http.get.mock.calls[0][1].auth).toEqual({ username: "tok-h", password: "" });
  });

  it("401 = token recusado", async () => {
    http.get.mockResolvedValue({ status: 401, data: "HTTP Basic: Access denied" });
    const r = await testarConfiguracaoFocus(EMPRESA, ENV);
    expect(r.ok).toBe(false);
    expect(r.etapas[0].mensagem).toMatch(/recusou o token/);
  });
});
