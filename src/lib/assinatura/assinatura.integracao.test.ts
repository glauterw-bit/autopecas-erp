// Assinatura, cadastro e webhook contra um Postgres de verdade.
// Roda só com ASSINATURA_TEST_DATABASE_URL (banco descartável, nunca produção):
//   ASSINATURA_TEST_DATABASE_URL=postgresql://localhost:5432/autopecas_erp_r4ass npx vitest run src/lib/assinatura/assinatura.integracao.test.ts
// O Asaas é simulado (fetch trocado por fixtures): nada sai para a internet.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { DIA_MS } from "./estado";
import { eventoAssinatura, eventoPagamento } from "./fixtures-asaas";

const URL_DB = process.env.ASSINATURA_TEST_DATABASE_URL;
if (URL_DB) process.env.DATABASE_URL = URL_DB;
process.env.ASAAS_WEBHOOK_TOKEN = "token-de-teste-asaas";
process.env.ASAAS_API_KEY = "chave-sandbox-falsa";
process.env.ASAAS_API_URL = "https://api-sandbox.asaas.com/v3";

const sessao = vi.hoisted(() => ({ usuario: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth/config", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/config")>()),
  usuarioDaSessao: async () => sessao.usuario,
  criarSessao: vi.fn(async () => "tok"),
}));

describe.skipIf(!URL_DB)("assinatura contra o banco", () => {
  let db: PrismaClient;
  const sufixo = String(Date.now()).slice(-6);
  const ids = { emp: "", user: "", ass: "", planoId: "" };
  const SUB = "sub_teste_" + sufixo;
  const CLI = "cus_teste_" + sufixo;
  let seq = 0;
  const evt = () => `evt_${sufixo}_${++seq}`;

  async function webhook(corpo: unknown, token: string | null = "token-de-teste-asaas") {
    const { POST } = await import("@/app/api/webhooks/asaas/route");
    const h: Record<string, string> = { "content-type": "application/json" };
    if (token) h["asaas-access-token"] = token;
    return POST(new NextRequest("http://x/api/webhooks/asaas", { method: "POST", headers: h, body: JSON.stringify(corpo) }));
  }
  const estado = () => db.assinatura.findUniqueOrThrow({ where: { id: ids.ass } });
  const ajustar = (data: Record<string, unknown>) => db.assinatura.update({ where: { id: ids.ass }, data });

  beforeAll(async () => {
    const mod = await import("@/lib/db");
    db = mod.prisma;
    const plano = await db.plano.findUniqueOrThrow({ where: { codigo: "PROFISSIONAL" } });
    ids.planoId = plano.id;
    const e = await db.empresa.create({ data: { razaoSocial: "Loja Teste Assinatura", cnpj: "9" + sufixo + "000199".slice(0, 7), email: `a${sufixo}@teste.com` } });
    ids.emp = e.id;
    const u = await db.usuario.create({ data: { empresaId: e.id, nome: "Admin", email: `admin${sufixo}@teste.com`, senhaHash: "x", perfil: "ADMIN" } });
    ids.user = u.id;
    const a = await db.assinatura.create({
      data: { empresaId: e.id, planoId: plano.id, status: "TRIAL", trialFimEm: new Date(Date.now() + 5 * DIA_MS), asaasAssinaturaId: SUB, asaasClienteId: CLI },
    });
    ids.ass = a.id;
  });

  beforeEach(async () => {
    await ajustar({ status: "TRIAL", inadimplenteDesde: null, suspensaMotivo: null, canceladaEm: null, ciclo: "MENSAL" });
    sessao.usuario = { id: ids.user, nome: "Admin", email: `admin${sufixo}@teste.com`, perfil: "ADMIN", ativo: true, empresaId: ids.emp, permissoes: [] };
  });

  afterAll(async () => {
    await db.empresa.deleteMany({ where: { id: ids.emp } });
    await db.plano.deleteMany({ where: { codigo: "T" + sufixo } });
    await db.empresa.deleteMany({ where: { razaoSocial: { startsWith: "Cadastro Teste " + sufixo } } });
    await db.eventoWebhook.deleteMany({ where: { origem: "ASAAS", idExterno: { startsWith: `evt_${sufixo}` } } });
    await db.$disconnect();
  });

  describe("webhook do Asaas", () => {
    it("recusa sem token e com token errado", async () => {
      expect((await webhook(eventoPagamento("PAYMENT_RECEIVED", { id: evt(), assinatura: SUB, cliente: CLI }), null)).status).toBe(401);
      expect((await webhook(eventoPagamento("PAYMENT_RECEIVED", { id: evt(), assinatura: SUB, cliente: CLI }), "errado")).status).toBe(401);
      expect((await estado()).status).toBe("TRIAL");
    });

    it("PAYMENT_CONFIRMED e PAYMENT_RECEIVED põem em ATIVA e avançam o vencimento", async () => {
      for (const tipo of ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"] as const) {
        await ajustar({ status: "INADIMPLENTE", inadimplenteDesde: new Date() });
        const r = await webhook(eventoPagamento(tipo, { id: evt(), assinatura: SUB, cliente: CLI, vencimento: "2026-11-10" }));
        expect(r.status).toBe(200);
        const a = await estado();
        expect(a.status).toBe("ATIVA");
        expect(a.inadimplenteDesde).toBeNull();
        expect(a.proximoVencimento?.toISOString().slice(0, 10)).toBe("2026-12-10");
      }
    });

    it("ciclo anual avança 12 meses", async () => {
      await ajustar({ ciclo: "ANUAL" });
      await webhook(eventoPagamento("PAYMENT_RECEIVED", { id: evt(), assinatura: SUB, cliente: CLI, vencimento: "2026-11-10" }));
      expect((await estado()).proximoVencimento?.toISOString().slice(0, 10)).toBe("2027-11-10");
    });

    it("PAYMENT_OVERDUE põe em INADIMPLENTE contando do vencimento", async () => {
      await ajustar({ status: "ATIVA" });
      await webhook(eventoPagamento("PAYMENT_OVERDUE", { id: evt(), assinatura: SUB, cliente: CLI, vencimento: "2026-11-01" }));
      const a = await estado();
      expect(a.status).toBe("INADIMPLENTE");
      expect(a.inadimplenteDesde?.toISOString().slice(0, 10)).toBe("2026-11-01");
    });

    it("aviso de atraso fora de ordem sobre cobrança já paga é ignorado", async () => {
      await ajustar({ status: "ATIVA" });
      await webhook(eventoPagamento("PAYMENT_OVERDUE", { id: evt(), assinatura: SUB, cliente: CLI, status: "RECEIVED" }));
      expect((await estado()).status).toBe("ATIVA");
    });

    it("cancelamento da assinatura põe em CANCELADA; pagamento atrasado depois não ressuscita", async () => {
      await ajustar({ status: "ATIVA" });
      await webhook(eventoAssinatura("SUBSCRIPTION_DELETED", { id: evt(), assinatura: SUB, cliente: CLI }));
      expect((await estado()).status).toBe("CANCELADA");
      await webhook(eventoPagamento("PAYMENT_RECEIVED", { id: evt(), assinatura: SUB, cliente: CLI }));
      expect((await estado()).status).toBe("CANCELADA");
    });

    it("suspensão feita à mão não é desfeita por pagamento", async () => {
      await ajustar({ status: "SUSPENSA", suspensaMotivo: "pedido da loja" });
      await webhook(eventoPagamento("PAYMENT_RECEIVED", { id: evt(), assinatura: SUB, cliente: CLI }));
      expect((await estado()).status).toBe("SUSPENSA");
    });

    it("é idempotente: o mesmo evento duas vezes mexe uma vez só", async () => {
      await ajustar({ status: "ATIVA" });
      const ev = eventoPagamento("PAYMENT_OVERDUE", { id: evt(), assinatura: SUB, cliente: CLI, vencimento: "2026-11-01" });
      const r1 = await (await webhook(ev)).json();
      expect(r1.resultado).toBe("PROCESSADO");
      // Alguém "conserta" o estado; o reenvio do mesmo evento não pode derrubar de novo.
      await ajustar({ status: "ATIVA", inadimplenteDesde: null });
      const r2 = await (await webhook(ev)).json();
      expect(r2.resultado).toBe("DUPLICADO");
      expect((await estado()).status).toBe("ATIVA");
      const regs = await db.eventoWebhook.count({ where: { origem: "ASAAS", idExterno: ev.id! } });
      expect(regs).toBe(1);
      const logs = await db.logAuditoria.count({ where: { entidade: "Assinatura", entidadeId: ids.ass, acao: "ASSINATURA_PAYMENT_OVERDUE" } });
      expect(logs).toBeGreaterThan(0);
    });

    it("evento de assinatura desconhecida é gravado e ignorado (200)", async () => {
      const r = await webhook(eventoPagamento("PAYMENT_RECEIVED", { id: evt(), assinatura: "sub_inexistente", cliente: "cus_inexistente" }));
      expect(r.status).toBe(200);
      expect((await r.json()).resultado).toBe("IGNORADO");
    });
  });

  describe("política central (comAuth)", () => {
    async function chamar(metodo: string, caminho: string) {
      const { comAuth } = await import("@/lib/auth/guard");
      const h = comAuth("ESTOQUISTA", async () => Response.json({ ok: true }));
      return h(new NextRequest(`http://x${caminho}`, { method: metodo }), undefined);
    }

    it("depois de 20 dias de atraso: escrita em cadastro dá 402, PDV segue vendendo", async () => {
      await ajustar({ status: "INADIMPLENTE", inadimplenteDesde: new Date(Date.now() - 25 * DIA_MS) });
      const bloqueada = await chamar("POST", "/api/produtos");
      expect(bloqueada.status).toBe(402);
      expect((await bloqueada.json()).codigo).toBe("SOMENTE_LEITURA");
      expect((await chamar("GET", "/api/produtos")).status).toBe(200);
      expect((await chamar("POST", "/api/vendas")).status).toBe(200);
      expect((await chamar("POST", "/api/caixa/abrir")).status).toBe(200);
    });

    it("durante a carência (5 dias) tudo segue liberado", async () => {
      await ajustar({ status: "INADIMPLENTE", inadimplenteDesde: new Date(Date.now() - 5 * DIA_MS) });
      expect((await chamar("POST", "/api/produtos")).status).toBe(200);
    });

    it("suspensa: nem o PDV passa, mas a assinatura sim", async () => {
      await ajustar({ status: "SUSPENSA", suspensaMotivo: "teste" });
      expect((await chamar("POST", "/api/vendas")).status).toBe(402);
      expect((await chamar("GET", "/api/produtos")).status).toBe(402);
      expect((await chamar("POST", "/api/assinatura/plano")).status).toBe(200);
    });

    it("módulo fora do plano dá 402 com explicação", async () => {
      await ajustar({ status: "ATIVA" });
      // PROFISSIONAL não inclui CONTABIL
      const r = await chamar("GET", "/api/contabil/dre");
      expect(r.status).toBe(402);
      const j = await r.json();
      expect(j.codigo).toBe("MODULO_FORA_DO_PLANO");
      expect(j.erro).toContain("Contábil");
      expect((await chamar("GET", "/api/ia/insights")).status).toBe(200);
    });

    it("empresa sem assinatura não é bloqueada", async () => {
      sessao.usuario = { ...sessao.usuario!, empresaId: "empresa-sem-assinatura" };
      expect((await chamar("POST", "/api/produtos")).status).toBe(200);
    });
  });

  describe("limites", () => {
    it("convite além do limite de usuários é bloqueado com a mensagem do plano", async () => {
      const { exigirLimiteUsuarios } = await import("./politica");
      const plano = await db.plano.create({ data: { codigo: "T" + sufixo, nome: "Teste", limiteUsuarios: 1, limiteNotasMes: 3, publico: false } });
      await ajustar({ planoId: plano.id });
      await expect(exigirLimiteUsuarios(ids.emp)).rejects.toMatchObject({ status: 402, message: expect.stringContaining("Seu plano permite 1 usuário") });
      await db.plano.update({ where: { id: plano.id }, data: { limiteUsuarios: 5 } });
      await expect(exigirLimiteUsuarios(ids.emp)).resolves.toBeUndefined();
    });

    it("notas acima do limite não bloqueiam e viram contador de excedente", async () => {
      const { registrarNotaEmitida, excedenteDoMes, chaveDoMes } = await import("./politica");
      const ass = await db.assinatura.findUniqueOrThrow({ where: { id: ids.ass } });
      await db.consumoNotasMes.deleteMany({ where: { empresaId: ids.emp } });
      await db.plano.update({ where: { id: ass.planoId }, data: { limiteNotasMes: 3, precoNotaExcedente: 0.25 } });
      for (let i = 0; i < 5; i++) await registrarNotaEmitida(db, ids.emp);
      const linha = await db.consumoNotasMes.findUniqueOrThrow({ where: { empresaId_mes: { empresaId: ids.emp, mes: chaveDoMes() } } });
      expect(linha.notas).toBe(5);
      expect(linha.excedentes).toBe(2);
      expect(await excedenteDoMes(ids.emp)).toEqual({ quantidade: 2, precoPorNota: "0.25" });
    });
  });

  describe("cadastro self-service", () => {
    const cnpjValido = "11222333000181";
    const corpo = (o: Record<string, unknown> = {}) => ({
      razaoSocial: `Cadastro Teste ${sufixo}`, cnpj: cnpjValido, nome: "Maria", email: `maria${sufixo}@teste.com`,
      celular: "(11) 91234-5678", senha: "SenhaForte123", aceite: true, ...o,
    });
    async function cadastrar(b: unknown, ip = "10.0.0." + Math.floor(Math.random() * 200)) {
      const { POST } = await import("@/app/api/cadastro/route");
      return POST(new NextRequest("http://x/api/cadastro", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(b) }));
    }

    it("cria empresa, ADMIN, trial de 14 dias e o aceite com versão e IP", async () => {
      await db.empresa.deleteMany({ where: { cnpj: cnpjValido } });
      const r = await cadastrar(corpo(), "203.0.113.7");
      expect(r.status).toBe(201);
      const emp = await db.empresa.findUniqueOrThrow({ where: { cnpj: cnpjValido }, include: { assinatura: true, usuarios: true } });
      expect(emp.usuarios[0].perfil).toBe("ADMIN");
      expect(emp.assinatura?.status).toBe("TRIAL");
      const dias = Math.round((emp.assinatura!.trialFimEm!.getTime() - Date.now()) / DIA_MS);
      expect(dias).toBe(14);
      const { TERMOS_VERSAO } = await import("@/lib/legal/versao");
      // Aceite dos três documentos (termos, privacidade e DPA) na versão vigente, com IP.
      const aceites = await db.aceiteTermos.findMany({ where: { empresaId: emp.id }, orderBy: { documento: "asc" } });
      expect(aceites.map((a) => a.documento)).toEqual(["DPA", "PRIVACIDADE", "TERMOS"]);
      for (const a of aceites) {
        expect(a).toMatchObject({ versao: TERMOS_VERSAO, ip: "203.0.113.7", usuarioId: emp.usuarios[0].id });
        expect(a.aceitoEm).toBeInstanceOf(Date);
      }
    });

    it("CNPJ repetido dá 409, e-mail repetido dá 409, e nada duplica", async () => {
      const dup = await cadastrar(corpo({ email: `outra${sufixo}@teste.com` }));
      expect(dup.status).toBe(409);
      expect((await dup.json()).erro).toContain("já tem cadastro");
      const outroCnpj = "00000000000191";
      const mail = await cadastrar(corpo({ cnpj: outroCnpj, razaoSocial: `Cadastro Teste ${sufixo} B` }));
      expect(mail.status).toBe(409);
      expect(await db.empresa.count({ where: { cnpj: { in: [cnpjValido, outroCnpj] }, razaoSocial: { startsWith: `Cadastro Teste ${sufixo}` } } })).toBe(1);
    });

    it("recusa CNPJ inválido, falta de aceite e senha fraca", async () => {
      expect((await cadastrar(corpo({ cnpj: "11222333000182" }))).status).toBe(400);
      expect((await cadastrar(corpo({ aceite: false }))).status).toBe(400);
      expect((await cadastrar(corpo({ aceite: undefined }))).status).toBe(400);
      expect((await cadastrar(corpo({ senha: "curta" }))).status).toBe(400);
    });

    it("honeypot preenchido não cria nada", async () => {
      const antes = await db.empresa.count();
      const r = await cadastrar(corpo({ website: "http://spam", cnpj: "00000000000272", email: `bot${sufixo}@teste.com` }));
      expect(r.status).toBe(200);
      expect(await db.empresa.count()).toBe(antes);
    });

    it("limita as tentativas por IP", async () => {
      const ip = "198.51.100." + (seq + 50);
      let ultimo = 0;
      for (let i = 0; i < 7; i++) ultimo = (await cadastrar(corpo({ cnpj: "11222333000182" }), ip)).status;
      expect(ultimo).toBe(429);
    });
  });

  describe("escolher plano e cancelar (Asaas simulado)", () => {
    const chamadas: { url: string; metodo: string; corpo: unknown }[] = [];
    beforeEach(() => {
      chamadas.length = 0;
      vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
        const corpo = init.body ? JSON.parse(String(init.body)) : undefined;
        chamadas.push({ url, metodo: String(init.method), corpo });
        const resp = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
        if (url.endsWith("/customers")) return resp({ id: "cus_novo" });
        if (url.endsWith("/subscriptions")) return resp({ id: "sub_novo", status: "ACTIVE" });
        if (url.includes("/payments")) return resp({ data: [{ id: "pay_1", status: "PENDING", value: 99, dueDate: "2026-11-20", invoiceUrl: "https://sandbox.asaas.com/i/abc" }] });
        return resp({ deleted: true });
      }));
    });
    afterAll(() => vi.unstubAllGlobals());

    it("recusa plano com preço zero (provisório): nada é cobrado", async () => {
      const { escolherPlano } = await import("./servico");
      await expect(escolherPlano({ id: ids.user, empresaId: ids.emp }, { planoCodigo: "COMPLETO", ciclo: "MENSAL", forma: "PIX" })).rejects.toMatchObject({ status: 422 });
      expect(chamadas).toHaveLength(0);
    });

    it("com preço definido cria cliente e assinatura e devolve o link da fatura; cancelar não apaga dados", async () => {
      const { escolherPlano, cancelarAssinatura } = await import("./servico");
      await db.plano.update({ where: { codigo: "COMPLETO" }, data: { precoMensal: 99, provisorio: false } });
      await ajustar({ asaasAssinaturaId: null, asaasClienteId: null, status: "TRIAL", trialFimEm: new Date(Date.now() + 5 * DIA_MS) });
      const r = await escolherPlano({ id: ids.user, empresaId: ids.emp }, { planoCodigo: "COMPLETO", ciclo: "MENSAL", forma: "PIX" });
      expect(r.linkPagamento).toBe("https://sandbox.asaas.com/i/abc");
      expect(chamadas.every((c) => c.url.startsWith("https://api-sandbox.asaas.com/v3"))).toBe(true);
      const assin = chamadas.find((c) => c.url.endsWith("/subscriptions"))!.corpo as Record<string, unknown>;
      expect(assin).toMatchObject({ customer: "cus_novo", billingType: "PIX", value: 99, cycle: "MONTHLY" });
      const a = await estado();
      expect(a.asaasAssinaturaId).toBe("sub_novo");
      expect(a.status).toBe("TRIAL");

      await db.produto.count({ where: { empresaId: ids.emp } });
      await cancelarAssinatura({ id: ids.user, empresaId: ids.emp });
      expect((await estado()).status).toBe("CANCELADA");
      expect(chamadas.some((c) => c.metodo === "DELETE" && c.url.endsWith("/subscriptions/sub_novo"))).toBe(true);
      expect(await db.usuario.count({ where: { empresaId: ids.emp } })).toBe(1);
      await db.plano.update({ where: { codigo: "COMPLETO" }, data: { precoMensal: 0, provisorio: true } });
    });

    it("cancelar -> reativar -> cancelar -> reativar não dá uso grátis novo: a dívida antiga não zera", async () => {
      const { escolherPlano, cancelarAssinatura } = await import("./servico");
      const { calcularAcesso } = await import("./estado");
      await db.plano.update({ where: { codigo: "COMPLETO" }, data: { precoMensal: 99, provisorio: false } });
      const ator = { id: ids.user, empresaId: ids.emp };
      const escolha = { planoCodigo: "COMPLETO", ciclo: "MENSAL", forma: "PIX" } as const;
      const desde = new Date(Date.now() - 25 * DIA_MS);
      await ajustar({ status: "INADIMPLENTE", inadimplenteDesde: desde, asaasAssinaturaId: "sub_velha", asaasClienteId: "cus_x" });

      await cancelarAssinatura(ator);
      expect((await estado()).inadimplenteDesde?.getTime()).toBe(desde.getTime());
      await escolherPlano(ator, escolha);
      let a = await estado();
      expect(a.status).toBe("INADIMPLENTE");
      expect(a.inadimplenteDesde?.getTime()).toBe(desde.getTime()); // data original, não "agora"
      expect(calcularAcesso(a).modo).toBe("SOMENTE_LEITURA"); // direto para somente leitura até pagar

      await cancelarAssinatura(ator);
      await escolherPlano(ator, escolha);
      a = await estado();
      expect(a.inadimplenteDesde?.getTime()).toBe(desde.getTime());
      expect(calcularAcesso(a).modo).toBe("SOMENTE_LEITURA");

      // Quem nunca teve dívida ganha a carência normal uma vez só, e ela não se renova.
      await ajustar({ status: "ATIVA", inadimplenteDesde: null, canceladaEm: null });
      await cancelarAssinatura(ator);
      await escolherPlano(ator, escolha);
      const primeira = (await estado()).inadimplenteDesde;
      expect(primeira).not.toBeNull();
      await ajustar({ inadimplenteDesde: new Date(Date.now() - 3 * DIA_MS) });
      const fixada = (await estado()).inadimplenteDesde!.getTime();
      await cancelarAssinatura(ator);
      await escolherPlano(ator, escolha);
      expect((await estado()).inadimplenteDesde!.getTime()).toBe(fixada);
      await db.plano.update({ where: { codigo: "COMPLETO" }, data: { precoMensal: 0, provisorio: true } });
    });

    it("quem já está ATIVA e só troca de plano mantém o vencimento", async () => {
      const { escolherPlano } = await import("./servico");
      await db.plano.update({ where: { codigo: "COMPLETO" }, data: { precoMensal: 99, provisorio: false } });
      const venc = new Date("2026-12-15T12:00:00Z");
      await ajustar({ status: "ATIVA", proximoVencimento: venc, asaasAssinaturaId: "sub_novo", asaasClienteId: "cus_novo", canceladaEm: null });
      await escolherPlano({ id: ids.user, empresaId: ids.emp }, { planoCodigo: "COMPLETO", ciclo: "ANUAL", forma: "PIX" }).catch(() => undefined);
      expect((await estado()).proximoVencimento?.getTime()).toBe(venc.getTime());
      await db.plano.update({ where: { codigo: "COMPLETO" }, data: { precoMensal: 0, provisorio: true } });
    });

    it("o módulo asaas recusa falar com a API real fora de produção", async () => {
      const antes = process.env.ASAAS_API_URL;
      process.env.ASAAS_API_URL = "https://api.asaas.com/v3";
      const { criarCliente } = await import("./asaas");
      await expect(criarCliente({ nome: "x", cnpj: "1", email: "a@b.c", empresaId: "e" })).rejects.toThrow(/sandbox/);
      process.env.ASAAS_API_URL = antes;
    });
  });

  describe("painel do dono do SaaS", () => {
    it("estender trial, mudar plano, suspender (com regra dos 15 dias) e reativar gravam LogAuditoria", async () => {
      const m = await import("./admin-saas");
      const ator = { id: ids.user, empresaId: ids.emp };
      await ajustar({ status: "TRIAL", trialFimEm: new Date(Date.now() + 2 * DIA_MS), asaasAssinaturaId: null });
      const r = await m.estenderTrial(ator, ids.emp, 7);
      expect(Math.round((r.trialFimEm.getTime() - Date.now()) / DIA_MS)).toBe(9);
      await m.mudarPlano(ator, ids.emp, "INICIAL");
      expect((await db.assinatura.findUniqueOrThrow({ where: { id: ids.ass }, include: { plano: true } })).plano.codigo).toBe("INICIAL");

      await ajustar({ status: "INADIMPLENTE", inadimplenteDesde: new Date(Date.now() - 8 * DIA_MS) });
      await expect(m.suspender(ator, ids.emp, "falta de pagamento", false)).rejects.toMatchObject({ status: 422 });
      await m.suspender(ator, ids.emp, "falta de pagamento", true);
      expect((await estado()).status).toBe("SUSPENSA");
      await m.reativar(ator, ids.emp);
      expect((await estado()).status).toBe("TRIAL");
      const acoes = (await db.logAuditoria.findMany({ where: { entidadeId: ids.ass, usuarioId: ids.user } })).map((l) => l.acao);
      expect(acoes).toEqual(expect.arrayContaining(["SAAS_TRIAL_ESTENDIDO", "SAAS_PLANO_ALTERADO", "SAAS_LOJA_SUSPENSA", "SAAS_LOJA_REATIVADA"]));
    });

    it("só entra quem está em SAAS_ADMIN_USER_IDS e tem 2FA; e-mail na lista antiga não vale", async () => {
      const { GET } = await import("@/app/api/admin-saas/route");
      const chamar = () => GET(new NextRequest("http://x/api/admin-saas"), undefined);
      const emailAdmin = `admin${sufixo}@teste.com`;
      process.env.SAAS_ADMIN_EMAILS = emailAdmin; // compatibilidade removida: não pode liberar
      process.env.SAAS_ADMIN_USER_IDS = "";
      expect((await chamar()).status).toBe(404);
      process.env.SAAS_ADMIN_USER_IDS = "outro-id";
      expect((await chamar()).status).toBe(404);
      process.env.SAAS_ADMIN_USER_IDS = ids.user;
      const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      await db.usuario.update({ where: { id: ids.user }, data: { totpSecret: null } });
      expect((await chamar()).status).toBe(404); // na lista, mas sem 2FA
      expect(aviso).toHaveBeenCalledWith(expect.stringContaining("sem 2FA"));
      aviso.mockRestore();
      await db.usuario.update({ where: { id: ids.user }, data: { totpSecret: "JBSWY3DPEHPK3PXP" } });
      const ok = await chamar();
      expect(ok.status).toBe(200);
      const j = await ok.json();
      expect(Array.isArray(j.lojas)).toBe(true);
      expect(typeof j.mrrCentavos).toBe("number");
      const { avisosAdminSaas } = await import("./admin-saas");
      expect(await avisosAdminSaas(db, { SAAS_ADMIN_USER_IDS: `${ids.user},nao-existe` })).toEqual([expect.stringContaining("nao-existe")]);
      expect(await avisosAdminSaas(db, {})).toEqual([expect.stringContaining("vazia")]);
      await db.usuario.update({ where: { id: ids.user }, data: { totpSecret: null } });
      delete process.env.SAAS_ADMIN_USER_IDS;
      delete process.env.SAAS_ADMIN_EMAILS;
    });
  });
});
