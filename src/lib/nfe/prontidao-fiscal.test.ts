import { describe, expect, it } from "vitest";
import { cifrar } from "../cripto";
import { checklistFiscal, mensagemBloqueio, pendenciasBloqueantes, type EmpresaFiscal } from "./prontidao-fiscal";

const K = Buffer.alloc(32, 5).toString("base64");
const ENV = { APP_ENCRYPTION_KEY: K };
const AGORA = new Date("2026-11-05T12:00:00-03:00");
const c = (s: string) => cifrar(s, ENV);

function empresaPronta(over: Partial<EmpresaFiscal> = {}, fiscal: Record<string, unknown> = {}): EmpresaFiscal {
  return {
    cnpj: "12345678000195",
    inscEstadual: "123456789012",
    regimeTributario: "LUCRO_PRESUMIDO",
    logradouro: "Rua A", numero: "10", bairro: "Centro", municipio: "Cotia", uf: "SP", cep: "06700-000",
    configuracoes: {
      fiscal: {
        focus: { ambiente: "homologacao", serieNfe: "1", serieNfce: "1", tokenHomologacao: c("tok-h") },
        nfce: { cscHomologacao: c("CSC-H"), idTokenHomologacao: "000001" },
        certificado: { validoAte: "2027-06-30T23:59:59.000Z", origem: "arquivo", atualizadoEm: "2026-11-01T00:00:00.000Z" },
        ibsCbs: { cst: "000", cClassTrib: "000001" },
        ...fiscal,
      },
    },
    ...over,
  };
}

const ids = (e: EmpresaFiscal, modelo?: "55" | "65", agora = AGORA) =>
  pendenciasBloqueantes(checklistFiscal(e, { agora, env: ENV, modelo })).map((i) => i.id);

describe("checklist de prontidão fiscal", () => {
  it("tudo preenchido: pronto para NF-e e NFC-e, sem mensagem de bloqueio", () => {
    expect(ids(empresaPronta(), "65")).toEqual([]);
    expect(mensagemBloqueio(checklistFiscal(empresaPronta(), { agora: AGORA, env: ENV, modelo: "65" }))).toBe("");
  });

  it("empresa vazia: aponta cada item que falta", () => {
    const e: EmpresaFiscal = { cnpj: "12345678000195", inscEstadual: null, regimeTributario: "LUCRO_PRESUMIDO", configuracoes: null };
    expect(ids(e, "65")).toEqual(["certificado", "ie", "endereco", "token", "serie", "csc", "ibsCbs"]);
    const msg = mensagemBloqueio(checklistFiscal(e, { agora: AGORA, env: ENV, modelo: "65" }));
    expect(msg).toContain("falta o token da Focus NFe");
    expect(msg).toContain("Inscrição estadual");
    expect(msg).toContain("CSC da NFC-e");
  });

  it("certificado vencido bloqueia com a data; aviso a 30 dias do vencimento", () => {
    const vencido = empresaPronta({}, { certificado: { validoAte: "2026-11-04T23:59:59-03:00", origem: "arquivo", atualizadoEm: "x" } });
    const itens = checklistFiscal(vencido, { agora: AGORA, env: ENV });
    expect(pendenciasBloqueantes(itens).map((i) => i.id)).toEqual(["certificado"]);
    expect(mensagemBloqueio(itens)).toContain("vencido em 04/11/2026");

    const vence = empresaPronta({}, { certificado: { validoAte: "2026-12-05T12:00:00-03:00", origem: "arquivo", atualizadoEm: "x" } });
    const cert = checklistFiscal(vence, { agora: AGORA, env: ENV }).find((i) => i.id === "certificado")!;
    expect(cert.ok).toBe(true);
    expect(cert.aviso).toContain("30 dia(s)");

    const longe = empresaPronta({}, { certificado: { validoAte: "2026-12-06T12:00:00-03:00", origem: "arquivo", atualizadoEm: "x" } });
    expect(checklistFiscal(longe, { agora: AGORA, env: ENV }).find((i) => i.id === "certificado")!.aviso).toBeUndefined();
  });

  it("CSC só conta para NFC-e (modelo 65)", () => {
    const semCsc = empresaPronta({}, { nfce: {} });
    expect(ids(semCsc, "55")).toEqual([]);
    expect(ids(semCsc, "65")).toEqual(["csc"]);
  });

  it("CSC e token são os do ambiente efetivo", () => {
    const e = empresaPronta({}, {
      focus: { ambiente: "producao", serieNfe: "1", serieNfce: "1", tokenHomologacao: c("h") },
      nfce: { cscHomologacao: c("CSC-H"), idTokenHomologacao: "1" },
    });
    // Servidor travado em homologação: usa os de homologação e avisa.
    const itens = checklistFiscal(e, { agora: AGORA, env: ENV, modelo: "65" });
    expect(pendenciasBloqueantes(itens)).toEqual([]);
    expect(itens.find((i) => i.id === "ambiente")!.aviso).toContain("travado em homologação");
    // Servidor liberado: faltam token e CSC de produção.
    expect(pendenciasBloqueantes(checklistFiscal(e, { agora: AGORA, env: { ...ENV, FOCUS_NFE_AMBIENTE: "producao" }, modelo: "65" })).map((i) => i.id))
      .toEqual(["token", "csc"]);
  });

  it("IBS/CBS: bloqueia no regime normal (desde 03/08/2026); no Simples só avisa até 01/01/2027", () => {
    const sem = { ibsCbs: {} };
    expect(ids(empresaPronta({}, sem))).toEqual(["ibsCbs"]);
    expect(ids(empresaPronta({ regimeTributario: "SIMPLES_NACIONAL" }, sem))).toEqual([]);
    expect(ids(empresaPronta({ regimeTributario: "SIMPLES_NACIONAL" }, sem), undefined, new Date("2027-01-01T10:00:00-03:00"))).toEqual(["ibsCbs"]);
  });

  it("série sem configuração explícita bloqueia (não assume \"1\" sozinho)", () => {
    const e = empresaPronta({}, { focus: { tokenHomologacao: c("h") } });
    expect(ids(e, "55")).toEqual(["serie"]);
  });

  it("token só no env (reserva do dono) também serve", () => {
    const e = empresaPronta({}, { focus: { serieNfe: "1", serieNfce: "1" } });
    expect(ids(e, "55")).toEqual(["token"]);
    expect(pendenciasBloqueantes(checklistFiscal(e, { agora: AGORA, env: { ...ENV, FOCUS_NFE_TOKEN: "g" }, modelo: "55" }))).toEqual([]);
  });

  it("endereço: diz o que falta", () => {
    const e = empresaPronta({ bairro: "", cep: "0670" });
    const item = checklistFiscal(e, { agora: AGORA, env: ENV }).find((i) => i.id === "endereco")!;
    expect(item.ok).toBe(false);
    expect(item.detalhe).toBe("Endereço fiscal: falta bairro, CEP.");
  });
});

describe("revisão R5: padrão salvo inválido e validade informada", () => {
  it("padrão antigo inválido: o checklist acusa e a mensagem aponta a tela", () => {
    const e = empresaPronta({}, { cstIcmsPadrao: "60" });
    expect(ids(e, "55")).toEqual(["cstPadrao"]);
    const msg = mensagemBloqueio(checklistFiscal(e, { agora: AGORA, env: ENV, modelo: "55" }));
    expect(msg).toContain("Configurações > Fiscal");
    expect(msg).toContain("Isenção, não tributação e ST");
    expect(ids(empresaPronta({}, { cstIcmsPadrao: "00" }), "55")).toEqual([]);
  });
  it("validade informada à mão: segue liberado, mas aparece como informado, não verificado", () => {
    const e = empresaPronta({}, { certificado: { validoAte: "2027-06-30T23:59:59.000Z", origem: "informado", atualizadoEm: "2026-11-01T00:00:00.000Z" } });
    expect(ids(e, "65")).toEqual([]);
    const item = checklistFiscal(e, { agora: AGORA, env: ENV, modelo: "65" }).find((i) => i.id === "certificado")!;
    expect(item.ok).toBe(true);
    expect(item.detalhe).toContain("Informado, não verificado");
    expect(item.aviso).toContain("não foi verificada");
  });
});
