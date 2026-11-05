import { describe, expect, it } from "vitest";
import {
  avaliarNotas, calcularAcesso, checarLimiteSimples, checarLimiteUsuarios, decidirRota, DIA_MS,
  moduloDaPagina, moduloDaRotaApi, moduloLiberado, prazosInadimplencia, suspensaoMinDias, type AssinaturaBasica, type LimitesPlano,
} from "./estado";
import { calcularMrrCentavos, checarSuspensao, ehAdminSaas } from "./admin-saas";

const AGORA = new Date("2026-11-30T12:00:00Z");
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * DIA_MS);
const base: AssinaturaBasica = { status: "ATIVA", trialFimEm: null, inadimplenteDesde: null, proximoVencimento: null };
const P = { avisoAteDias: 10, leituraAposDias: 20 };

const plano: LimitesPlano = {
  nome: "Teste", limiteUsuarios: 2, limiteDepositos: null, limiteNotasMes: 100, limiteProdutos: null, modulos: ["IA"],
};

describe("prazos por env", () => {
  it("padrões: aviso até o dia 10, somente leitura a partir do dia 20", () => {
    expect(prazosInadimplencia({})).toEqual({ avisoAteDias: 10, leituraAposDias: 20 });
  });
  it("lê da env e nunca deixa a leitura vir antes do aviso", () => {
    expect(prazosInadimplencia({ ASSINATURA_AVISO_ATE_DIAS: "5", ASSINATURA_LEITURA_APOS_DIAS: "12" })).toEqual({ avisoAteDias: 5, leituraAposDias: 12 });
    expect(prazosInadimplencia({ ASSINATURA_AVISO_ATE_DIAS: "15", ASSINATURA_LEITURA_APOS_DIAS: "3" }).leituraAposDias).toBe(15);
  });
  it("suspensão nunca antes de 15 dias nem antes da somente leitura", () => {
    expect(suspensaoMinDias({})).toBe(30);
    expect(suspensaoMinDias({ ASSINATURA_SUSPENSAO_MIN_DIAS: "5" })).toBe(20);
  });
});

describe("modo de acesso por status", () => {
  it("ATIVA é normal", () => {
    expect(calcularAcesso(base, AGORA, P).modo).toBe("NORMAL");
  });
  it("inadimplente: aviso nos dias 1 a 19, somente leitura do dia 20", () => {
    const m = (d: number) => calcularAcesso({ ...base, status: "INADIMPLENTE", inadimplenteDesde: diasAtras(d) }, AGORA, P).modo;
    expect(m(1)).toBe("AVISO");
    expect(m(10)).toBe("AVISO");
    expect(m(19)).toBe("AVISO");
    expect(m(20)).toBe("SOMENTE_LEITURA");
    expect(m(45)).toBe("SOMENTE_LEITURA");
  });
  it("trial em andamento é normal; avisa nos últimos 3 dias", () => {
    expect(calcularAcesso({ ...base, status: "TRIAL", trialFimEm: new Date(AGORA.getTime() + 10 * DIA_MS) }, AGORA, P).modo).toBe("NORMAL");
    expect(calcularAcesso({ ...base, status: "TRIAL", trialFimEm: new Date(AGORA.getTime() + 2 * DIA_MS) }, AGORA, P).modo).toBe("AVISO");
  });
  it("trial vencido sem plano segue a mesma escada da inadimplência", () => {
    const t = (d: number) => calcularAcesso({ ...base, status: "TRIAL", trialFimEm: diasAtras(d) }, AGORA, P).modo;
    expect(t(2)).toBe("AVISO");
    expect(t(25)).toBe("SOMENTE_LEITURA");
  });
  it("suspensa é SUSPENSO; cancelada tem acesso até o fim do período pago", () => {
    expect(calcularAcesso({ ...base, status: "SUSPENSA" }, AGORA, P).modo).toBe("SUSPENSO");
    expect(calcularAcesso({ ...base, status: "CANCELADA", proximoVencimento: new Date(AGORA.getTime() + 5 * DIA_MS) }, AGORA, P).modo).toBe("AVISO");
    expect(calcularAcesso({ ...base, status: "CANCELADA", proximoVencimento: diasAtras(1) }, AGORA, P).modo).toBe("SOMENTE_LEITURA");
  });
});

describe("rotas no modo somente leitura (PDV liberado)", () => {
  const leitura = (metodo: string, caminho: string) => decidirRota("SOMENTE_LEITURA", "Atraso.", metodo, caminho);
  it("bloqueia escrita em cadastro e financeiro com 402", () => {
    for (const c of ["/api/produtos", "/api/financeiro", "/api/compras/sugestao", "/api/usuarios", "/api/nfe/importar", "/api/fiscal/operacoes"]) {
      const r = leitura("POST", c);
      expect(r.liberado, c).toBe(false);
      if (!r.liberado) {
        expect(r.status).toBe(402);
        expect(r.codigo).toBe("SOMENTE_LEITURA");
        expect(r.erro).toContain("Atraso.");
      }
    }
  });
  it("libera leitura em qualquer rota", () => {
    expect(leitura("GET", "/api/financeiro").liberado).toBe(true);
  });
  it("PDV continua vendendo e emitindo NFC-e", () => {
    for (const [m, c] of [
      ["POST", "/api/vendas"], ["POST", "/api/vendas/abc/faturar"], ["POST", "/api/caixa/abrir"], ["POST", "/api/caixa/movimento"],
      ["POST", "/api/pix/cobranca"], ["GET", "/api/nfe/n1/consultar"], ["POST", "/api/nfe/n1/consultar"], ["POST", "/api/clientes"],
    ]) {
      expect(leitura(m, c).liberado, `${m} ${c}`).toBe(true);
    }
  });
  it("assinatura, exportação, login e painel do dono sempre liberados", () => {
    for (const c of ["/api/assinatura/plano", "/api/assinatura/cancelar", "/api/auth/logout", "/api/exportar/dados", "/api/admin-saas", "/api/conta/senha"]) {
      expect(leitura("POST", c).liberado, c).toBe(true);
    }
  });
  it("conta suspensa: só login, exportar e pagar (até leitura é negada)", () => {
    expect(decidirRota("SUSPENSO", "x", "GET", "/api/produtos").liberado).toBe(false);
    expect(decidirRota("SUSPENSO", "x", "POST", "/api/vendas").liberado).toBe(false);
    expect(decidirRota("SUSPENSO", "x", "POST", "/api/assinatura/plano").liberado).toBe(true);
    expect(decidirRota("SUSPENSO", "x", "GET", "/api/exportar/dados").liberado).toBe(true);
    expect(decidirRota("SUSPENSO", "x", "POST", "/api/auth/login").liberado).toBe(true);
  });
  it("modo normal e aviso não bloqueiam nada", () => {
    expect(decidirRota("AVISO", "x", "POST", "/api/produtos").liberado).toBe(true);
  });
});

describe("limites do plano", () => {
  it("usuário além do limite bloqueia o convite, com a mensagem do plano", () => {
    expect(checarLimiteUsuarios(plano, 1).ok).toBe(true);
    const r = checarLimiteUsuarios(plano, 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("Seu plano permite 2 usuários");
  });
  it("sem limite (nulo) nunca bloqueia", () => {
    expect(checarLimiteUsuarios({ ...plano, limiteUsuarios: null }, 999).ok).toBe(true);
    expect(checarLimiteSimples(10, null, "produto", "produtos").ok).toBe(true);
    expect(checarLimiteSimples(5, 5, "produto", "produtos").ok).toBe(false);
  });
  it("notas: sem aviso até 79, aviso aos 80, aviso ao chegar em 100, e depois excedente sem bloquear", () => {
    expect(avaliarNotas(plano, 79).nivel).toBe("OK");
    expect(avaliarNotas(plano, 79).aviso).toBeNull();
    const a80 = avaliarNotas(plano, 80);
    expect(a80.nivel).toBe("AVISO_80");
    expect(a80.aviso).toContain("Seu plano permite 100 notas por mês");
    expect(avaliarNotas(plano, 99).nivel).toBe("AVISO_80");
    const a100 = avaliarNotas(plano, 100);
    expect(a100.nivel).toBe("NO_LIMITE");
    expect(a100.aviso).toBeTruthy();
    const ex = avaliarNotas(plano, 103);
    expect(ex.nivel).toBe("EXCEDENTE");
    expect(ex.excedentes).toBe(3);
    expect(ex.bloqueia).toBe(false);
    expect(avaliarNotas({ limiteNotasMes: null }, 5000).aviso).toBeNull();
  });
  it("módulo fora do plano", () => {
    expect(moduloLiberado(plano, "IA")).toBe(true);
    expect(moduloLiberado(plano, "CONTABIL")).toBe(false);
    expect(moduloDaRotaApi("/api/contabil/dre")).toBe("CONTABIL");
    expect(moduloDaRotaApi("/api/ia/chat")).toBe("IA");
    expect(moduloDaRotaApi("/api/marketplaces/sync")).toBe("MARKETPLACES");
    expect(moduloDaRotaApi("/api/clientes/c1/b2b")).toBe("B2B");
    expect(moduloDaRotaApi("/api/vendas")).toBeNull();
    expect(moduloDaPagina("/contabil/dre")).toBe("CONTABIL");
    expect(moduloDaPagina("/pdv")).toBeNull();
  });
});

describe("painel do dono do SaaS", () => {
  it("só os e-mails da env entram", () => {
    const env = { SAAS_ADMIN_EMAILS: "Dono@Exemplo.com, outro@x.com" };
    expect(ehAdminSaas("dono@exemplo.com", env)).toBe(true);
    expect(ehAdminSaas("admin@loja.com", env)).toBe(false);
    expect(ehAdminSaas("dono@exemplo.com", {})).toBe(false);
  });
  it("MRR soma só as ativas (anual dividido por 12), em centavos", () => {
    const pl = (m: string, a: string) => ({ precoMensal: m, precoAnual: a });
    expect(
      calcularMrrCentavos([
        { status: "ATIVA", ciclo: "MENSAL", plano: pl("100.00", "1000.00") },
        { status: "ATIVA", ciclo: "ANUAL", plano: pl("100.00", "1200.00") },
        { status: "TRIAL", ciclo: "MENSAL", plano: pl("500.00", "0") },
        { status: "INADIMPLENTE", ciclo: "MENSAL", plano: pl("500.00", "0") },
      ]),
    ).toBe(10000 + 10000);
  });
  it("não suspende atraso curto sem forçar", () => {
    const a = { status: "INADIMPLENTE" as const, inadimplenteDesde: diasAtras(10), trialFimEm: null };
    expect(checarSuspensao(a, AGORA, false)).toContain("atraso há 10 dia");
    expect(checarSuspensao(a, AGORA, true)).toBeNull();
    expect(checarSuspensao({ ...a, inadimplenteDesde: diasAtras(40) }, AGORA, false)).toBeNull();
  });
});
