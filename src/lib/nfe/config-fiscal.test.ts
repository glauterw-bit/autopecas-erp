import { describe, expect, it } from "vitest";
import { decifrar } from "../cripto";
import { aplicarConfigFiscal, errosDeValidacao, esquemaConfigFiscal, visaoConfigFiscal } from "./config-fiscal";
import { fiscalParaLog } from "./config-fiscal-servico";

const K = Buffer.alloc(32, 4).toString("base64");
const ENV = { APP_ENCRYPTION_KEY: K };
const AGORA = new Date("2026-11-05T12:00:00-03:00");

const BASE = {
  regimeTributario: "SIMPLES_NACIONAL",
  inscEstadual: "123.456.789.012",
  inscMunicipal: "",
  cnaeFiscal: "4530-7/03",
  logradouro: "Rua das Peças", numero: "100", complemento: "", bairro: "Centro", municipio: "Taboão da Serra", uf: "SP", cep: "06750-000",
  ambiente: "homologacao", modo: "token",
  serieNfe: "1", serieNfce: "2",
  proximoNumeroNfe: "", proximoNumeroNfce: "151",
  tokenHomologacao: "token-homologacao-abcdef123456",
  cscHomologacao: "CSC-SECRETO-0001",
  idTokenHomologacao: "000001",
  cstIcmsPadrao: "102", cstPisCofinsSimples: "49", cstIbsCbs: "000", cClassTrib: "000001",
  emailXml: "contador@escritorio.com.br",
  certificadoValidoAte: "",
};

const parse = (o: Record<string, unknown>) => esquemaConfigFiscal.safeParse({ ...BASE, ...o });

describe("validação da tela (mensagens em português)", () => {
  it("aceita o formulário completo e limpa máscaras", () => {
    const p = parse({ proximoNumeroNfe: undefined });
    expect(p.success).toBe(true);
    if (!p.success) return;
    expect(p.data.inscEstadual).toBe("123456789012");
    expect(p.data.cnaeFiscal).toBe("4530703");
    expect(p.data.cep).toBe("06750000");
    expect(p.data.proximoNumeroNfce).toBe(151);
  });

  it("aponta cada campo errado", () => {
    const p = parse({ inscEstadual: "", cep: "123", serieNfe: "1000", uf: "XX", emailXml: "sem-arroba", cnaeFiscal: "12" });
    expect(p.success).toBe(false);
    if (p.success) return;
    const e = errosDeValidacao(p.error);
    expect(e.inscEstadual).toMatch(/Inscrição estadual/);
    expect(e.cep).toBe("CEP: são 8 dígitos");
    expect(e.serieNfe).toMatch(/Série da NF-e/);
    expect(e.uf).toBe("UF: escolha o estado");
    expect(e.emailXml).toMatch(/E-mail/);
    expect(e.cnaeFiscal).toMatch(/CNAE/);
  });

  it("campo ausente: mensagem em português, nunca \"Required\"", () => {
    const p = esquemaConfigFiscal.safeParse({ regimeTributario: "SIMPLES_NACIONAL" });
    expect(p.success).toBe(false);
    if (p.success) return;
    const e = errosDeValidacao(p.error);
    expect(e.bairro).toBe("Bairro: preencha este campo");
    expect(e.serieNfe).toBe("Série da NF-e: preencha este campo");
    expect(JSON.stringify(e)).not.toMatch(/Required|Expected/);
  });

  it("CST/CSOSN padrão conforme o regime", () => {
    const simplesComCst = parse({ cstIcmsPadrao: "00" });
    expect(simplesComCst.success).toBe(false);
    if (!simplesComCst.success) expect(errosDeValidacao(simplesComCst.error).cstIcmsPadrao).toMatch(/CSOSN/);
    const normalComCsosn = parse({ regimeTributario: "LUCRO_PRESUMIDO", cstIcmsPadrao: "102", cstPisCofinsSimples: "" });
    expect(normalComCsosn.success).toBe(false);
    expect(parse({ regimeTributario: "LUCRO_PRESUMIDO", cstIcmsPadrao: "00", cstPisCofinsSimples: "" }).success).toBe(true);
  });

  it("IBS/CBS: CST suportado e cClassTrib juntos", () => {
    expect(parse({ cClassTrib: "" }).success).toBe(false);
    expect(parse({ cstIbsCbs: "200" }).success).toBe(false);
    expect(parse({ cstIbsCbs: "", cClassTrib: "" }).success).toBe(true);
  });
});

describe("aplicarConfigFiscal", () => {
  it("grava segredos cifrados e mantém o resto do fiscal", () => {
    const p = parse({});
    if (!p.success) throw p.error;
    const { fiscal, colunas } = aplicarConfigFiscal({ ibsCbs: { aliquotas: { "2027": {} } }, outraChave: 1 }, p.data, { env: ENV, agora: AGORA });
    expect(fiscal.focus?.tokenHomologacao).toMatch(/^enc:v1:/);
    expect(decifrar(fiscal.focus!.tokenHomologacao!, ENV)).toBe("token-homologacao-abcdef123456");
    expect(decifrar(fiscal.nfce!.cscHomologacao!, ENV)).toBe("CSC-SECRETO-0001");
    expect(JSON.stringify(fiscal)).not.toContain("CSC-SECRETO");
    expect(fiscal.ibsCbs).toEqual({ aliquotas: { "2027": {} }, cst: "000", cClassTrib: "000001" });
    expect(fiscal.outraChave).toBe(1);
    expect(fiscal.focus?.serieNfce).toBe("2");
    expect(colunas).toMatchObject({ inscEstadual: "123456789012", cep: "06750000", regimeTributario: "SIMPLES_NACIONAL" });
  });

  it("segredo ausente mantém o atual; vazio apaga", () => {
    const p1 = parse({});
    if (!p1.success) throw p1.error;
    const { fiscal } = aplicarConfigFiscal({}, p1.data, { env: ENV });
    const p2 = parse({ tokenHomologacao: undefined, cscHomologacao: "" });
    if (!p2.success) throw p2.error;
    const { fiscal: f2 } = aplicarConfigFiscal(fiscal, p2.data, { env: ENV });
    expect(f2.focus?.tokenHomologacao).toBe(fiscal.focus?.tokenHomologacao);
    expect(f2.nfce?.cscHomologacao).toBeUndefined();
  });

  it("validade digitada só quando não há leitura do arquivo", () => {
    const p = parse({ certificadoValidoAte: "2027-03-31" });
    if (!p.success) throw p.error;
    expect(aplicarConfigFiscal({}, p.data, { env: ENV }).fiscal.certificado).toMatchObject({ origem: "informado", validoAte: "2027-04-01T02:59:59.000Z" });
    const doArquivo = { certificado: { validoAte: "2027-01-01T00:00:00.000Z", origem: "arquivo" as const, atualizadoEm: "x" } };
    expect(aplicarConfigFiscal(doArquivo, p.data, { env: ENV }).fiscal.certificado?.origem).toBe("arquivo");
  });
});

describe("tela e log nunca mostram o segredo", () => {
  it("visão mascarada e log com [cifrado]", () => {
    const p = parse({});
    if (!p.success) throw p.error;
    const { fiscal } = aplicarConfigFiscal({}, p.data, { env: ENV });
    const v = visaoConfigFiscal({ fiscal }, ENV);
    expect(v.tokenHomologacao).toEqual({ configurado: true, mascara: "••••3456" });
    expect(v.cscHomologacao).toEqual({ configurado: true, mascara: "••••0001" });
    expect(v.tokenProducao).toEqual({ configurado: false, mascara: "" });
    expect(JSON.stringify(v)).not.toContain("token-homologacao");
    const log = JSON.stringify(fiscalParaLog(fiscal));
    expect(log).not.toContain("enc:v1");
    expect(log).toContain("[cifrado]");
  });
});

describe("revisão R5: padrão restrito e validade digitada", () => {
  it("recusa 40, 41, 60, 300, 400 e 500 como padrão", () => {
    for (const cst of ["300", "400", "500"]) {
      const r = parse({ cstIcmsPadrao: cst });
      expect(r.success).toBe(false);
      if (!r.success) expect(errosDeValidacao(r.error).cstIcmsPadrao).toContain("Isenção, não tributação e ST precisam estar no cadastro de cada produto");
    }
    for (const cst of ["40", "41", "60"]) {
      const r = parse({ regimeTributario: "LUCRO_PRESUMIDO", cstIcmsPadrao: cst, cstPisCofinsSimples: "" });
      expect(r.success).toBe(false);
      if (!r.success) expect(errosDeValidacao(r.error).cstIcmsPadrao).toContain("Isenção, não tributação e ST");
    }
  });
  it("validade digitada só vale no modo token (a Focus já tem o certificado)", () => {
    expect(parse({ modo: "api", certificadoValidoAte: "2027-03-31" }).success).toBe(false);
    expect(parse({ modo: "token", certificadoValidoAte: "2027-03-31" }).success).toBe(true);
  });
});
