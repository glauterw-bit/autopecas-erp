// Regras puras da assinatura (sem banco): dá para testar com valores fixos.
//
// REGRA DE OURO (documentada para o dono): a venda de balcão não para por
// causa de cobrança, e dado de loja nunca é apagado. Cobrança em atraso segue
// uma escada (prazos em dias de atraso, configuráveis por env):
//   dia 1 a 10   ASSINATURA_AVISO_ATE_DIAS (padrão 10): banner de aviso;
//   dia 11 a 19  banner mais forte, tudo ainda liberado;
//   dia 20 em diante  ASSINATURA_LEITURA_APOS_DIAS (padrão 20): SOMENTE LEITURA,
//                cadastro e financeiro travados (402), MAS o PDV continua
//                vendendo e emitindo NFC-e;
//   SUSPENSA     só por decisão do dono do SaaS, nunca antes de
//                ASSINATURA_SUSPENSAO_MIN_DIAS (padrão 30) de atraso e com
//                aviso: aí sobram login, exportar dados e pagar.
// O limite de notas do plano NUNCA bloqueia emissão: o excedente é contado
// (ConsumoNotasMes) para cobrança futura.

export type StatusAssinatura = "TRIAL" | "ATIVA" | "INADIMPLENTE" | "SUSPENSA" | "CANCELADA";

export type ModoAcesso =
  | "NORMAL" // tudo liberado
  | "AVISO" // tudo liberado, mas mostra banner (trial acabando, carência, cancelada com prazo)
  | "SOMENTE_LEITURA" // escrita bloqueada (402), exceto PDV/venda/caixa e pagamento
  | "SUSPENSO"; // só login, exportar e pagar

export const DIA_MS = 24 * 3600 * 1000;
/** Piso fixo: nenhuma env faz a suspensão sem "forçar" vir antes de 15 dias de atraso. */
export const SUSPENSAO_PISO_DIAS = 15;

export type AssinaturaBasica = {
  status: StatusAssinatura;
  trialFimEm: Date | null;
  inadimplenteDesde: Date | null;
  proximoVencimento: Date | null;
};

export type AcessoCalculado = {
  modo: ModoAcesso;
  /** Mensagem para o banner / para o 402. */
  mensagem: string | null;
  /** Dias até o corte (aviso/carência) ou null. */
  diasRestantes: number | null;
};

export type Prazos = { avisoAteDias: number; leituraAposDias: number };

function inteiroEnv(v: string | undefined, padrao: number): number {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : padrao;
}

export function prazosInadimplencia(env: Record<string, string | undefined> = process.env): Prazos {
  const aviso = inteiroEnv(env.ASSINATURA_AVISO_ATE_DIAS, 10);
  const leitura = Math.max(inteiroEnv(env.ASSINATURA_LEITURA_APOS_DIAS, 20), aviso);
  return { avisoAteDias: aviso, leituraAposDias: leitura };
}

/** Dias de atraso a partir dos quais o dono do SaaS pode suspender sem forçar. */
export function suspensaoMinDias(env: Record<string, string | undefined> = process.env): number {
  return Math.max(inteiroEnv(env.ASSINATURA_SUSPENSAO_MIN_DIAS, 30), SUSPENSAO_PISO_DIAS, prazosInadimplencia(env).leituraAposDias);
}

function diasAte(alvo: Date, agora: Date): number {
  return Math.ceil((alvo.getTime() - agora.getTime()) / DIA_MS);
}

export function calcularAcesso(
  a: AssinaturaBasica,
  agora: Date = new Date(),
  prazos: Prazos = prazosInadimplencia(),
): AcessoCalculado {
  switch (a.status) {
    case "ATIVA":
      return { modo: "NORMAL", mensagem: null, diasRestantes: null };

    case "TRIAL": {
      if (!a.trialFimEm) return { modo: "NORMAL", mensagem: null, diasRestantes: null };
      if (agora < a.trialFimEm) {
        const d = diasAte(a.trialFimEm, agora);
        return d <= 3
          ? { modo: "AVISO", mensagem: `Seu período de teste termina em ${d} dia${d === 1 ? "" : "s"}. Escolha um plano para continuar sem interrupção.`, diasRestantes: d }
          : { modo: "NORMAL", mensagem: null, diasRestantes: d };
      }
      return atrasoDesde(a.trialFimEm, agora, prazos, "Seu período de teste terminou.");
    }

    case "INADIMPLENTE": {
      const desde = a.inadimplenteDesde ?? agora;
      return atrasoDesde(desde, agora, prazos, "Há uma cobrança em atraso.");
    }

    case "CANCELADA":
      if (a.proximoVencimento && agora < a.proximoVencimento) {
        return {
          modo: "AVISO",
          mensagem: `Assinatura cancelada. O acesso completo vai até ${a.proximoVencimento.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Seus dados continuam guardados.`,
          diasRestantes: diasAte(a.proximoVencimento, agora),
        };
      }
      return {
        modo: "SOMENTE_LEITURA",
        mensagem: "Assinatura cancelada. Você ainda consulta e exporta seus dados; para voltar a usar, escolha um plano.",
        diasRestantes: null,
      };

    case "SUSPENSA":
      return {
        modo: "SUSPENSO",
        mensagem: "Conta suspensa. Regularize o pagamento para voltar a usar. Você ainda consegue exportar seus dados.",
        diasRestantes: null,
      };
  }
}

function atrasoDesde(inicio: Date, agora: Date, prazos: Prazos, motivo: string): AcessoCalculado {
  const corte = new Date(inicio.getTime() + prazos.leituraAposDias * DIA_MS);
  if (agora < corte) {
    const d = diasAte(corte, agora);
    const diasDeAtraso = Math.max(1, Math.ceil((agora.getTime() - inicio.getTime()) / DIA_MS));
    const urgente = diasDeAtraso > prazos.avisoAteDias;
    return {
      modo: "AVISO",
      mensagem: urgente
        ? `${motivo} Em ${d} dia${d === 1 ? "" : "s"} as telas de cadastro e financeiro passam a ficar só para consulta. Regularize agora. O balcão continua vendendo.`
        : `${motivo} Regularize quando puder para não perder o acesso às telas de cadastro e financeiro. O balcão continua vendendo.`,
      diasRestantes: d,
    };
  }
  return {
    modo: "SOMENTE_LEITURA",
    mensagem: `${motivo} Seu acesso está só para consulta: cadastros e financeiro ficam travados até o pagamento. O balcão (PDV) continua vendendo e emitindo NFC-e, e nenhum dado seu é apagado.`,
    diasRestantes: 0,
  };
}

// --- Rotas -------------------------------------------------------------------

/** Sempre liberadas, em qualquer modo (login, pagar, exportar, painel do dono do SaaS). */
export const PREFIXOS_SEMPRE_LIBERADOS = [
  "/api/auth",
  "/api/assinatura",
  "/api/conta",
  "/api/admin-saas",
  "/api/exportar", // exportação dos dados da loja (LGPD)
  "/api/lgpd",
];

/**
 * Escritas liberadas em SOMENTE_LEITURA: o balcão. Venda, caixa, PDV, cobrança
 * Pix do balcão, consulta/emissão de nota da venda e cadastro rápido de cliente.
 * Acrescente aqui só o que for indispensável para vender no balcão.
 */
export const PREFIXOS_BALCAO = [
  "/api/vendas",
  "/api/caixa",
  "/api/pdv",
  "/api/pix/cobranca",
  "/api/clientes",
  "/api/produtos/buscar-pdv",
];

/** Consulta da nota de uma venda (o PDV confere a NFC-e). Não libera importação de XML. */
const CONSULTA_NOTA = /^\/api\/nfe\/[^/]+\/consultar$/;

function comecaCom(caminho: string, prefixos: string[]): boolean {
  return prefixos.some((p) => caminho === p || caminho.startsWith(p.endsWith("/") ? p : p + "/"));
}

export function ehMetodoDeEscrita(metodo: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(metodo.toUpperCase());
}

export type DecisaoRota = { liberado: true } | { liberado: false; status: 402; codigo: string; erro: string };

export function decidirRota(modo: ModoAcesso, mensagem: string | null, metodo: string, caminho: string): DecisaoRota {
  if (modo === "NORMAL" || modo === "AVISO") return { liberado: true };
  if (comecaCom(caminho, PREFIXOS_SEMPRE_LIBERADOS)) return { liberado: true };
  if (modo === "SUSPENSO") {
    return { liberado: false, status: 402, codigo: "CONTA_SUSPENSA", erro: mensagem ?? "Conta suspensa." };
  }
  // SOMENTE_LEITURA
  if (!ehMetodoDeEscrita(metodo)) return { liberado: true };
  if (comecaCom(caminho, PREFIXOS_BALCAO) || CONSULTA_NOTA.test(caminho)) return { liberado: true };
  return {
    liberado: false,
    status: 402,
    codigo: "SOMENTE_LEITURA",
    erro: `${mensagem ?? "Acesso somente para consulta."} Para voltar a editar, regularize a assinatura em Configurações > Assinatura.`,
  };
}

// --- Módulos e limites -----------------------------------------------------------

export type Modulo = "MARKETPLACES" | "IA" | "B2B" | "CONTABIL";

export const NOME_MODULO: Record<Modulo, string> = {
  MARKETPLACES: "Marketplaces",
  IA: "Inteligência artificial",
  B2B: "Portal das oficinas (B2B)",
  CONTABIL: "Contábil",
};

const MODULOS_API: Array<[RegExp, Modulo]> = [
  [/^\/api\/marketplaces(\/|$)/, "MARKETPLACES"],
  [/^\/api\/ia(\/|$)/, "IA"],
  [/^\/api\/contabil(\/|$)/, "CONTABIL"],
  [/^\/api\/clientes\/[^/]+\/b2b(\/|$)/, "B2B"],
];

export function moduloDaRotaApi(caminho: string): Modulo | null {
  return MODULOS_API.find(([re]) => re.test(caminho))?.[1] ?? null;
}

const MODULOS_PAGINA: Record<string, Modulo> = {
  "/marketplaces": "MARKETPLACES",
  "/ia": "IA",
  "/contabil": "CONTABIL",
  "/b2b": "B2B",
};

export function moduloDaPagina(rota: string): Modulo | null {
  const limpo = rota.split("?")[0].replace(/\/+$/, "") || "/";
  for (const [prefixo, mod] of Object.entries(MODULOS_PAGINA)) {
    if (limpo === prefixo || limpo.startsWith(prefixo + "/")) return mod;
  }
  return null;
}

export type LimitesPlano = {
  nome: string;
  limiteUsuarios: number | null;
  limiteDepositos: number | null;
  limiteNotasMes: number | null;
  limiteProdutos: number | null;
  modulos: string[];
};

export function moduloLiberado(plano: Pick<LimitesPlano, "modulos">, modulo: Modulo): boolean {
  return plano.modulos.includes(modulo);
}

export type ResultadoLimite =
  | { ok: true; aviso: string | null; percentual: number | null }
  | { ok: false; erro: string };

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** Usuário novo: bloqueia quando já está no limite. `usadosAtuais` conta ativos e convites pendentes. */
export function checarLimiteUsuarios(plano: LimitesPlano, usadosAtuais: number): ResultadoLimite {
  const lim = plano.limiteUsuarios;
  if (lim === null) return { ok: true, aviso: null, percentual: null };
  if (usadosAtuais >= lim) {
    return { ok: false, erro: `Seu plano permite ${lim} ${plural(lim, "usuário", "usuários")}. Para convidar mais gente, mude de plano em Configurações > Assinatura.` };
  }
  return { ok: true, aviso: null, percentual: Math.round((usadosAtuais / lim) * 100) };
}

export type ResultadoNotas = {
  /** Nunca bloqueia. */
  bloqueia: false;
  nivel: "OK" | "AVISO_80" | "NO_LIMITE" | "EXCEDENTE";
  aviso: string | null;
  percentual: number | null;
  excedentes: number;
};

/**
 * Notas do mês: avisa a partir de 80% e de novo ao chegar em 100%. Acima do
 * limite a nota sai normalmente e conta como excedente (cobrança futura).
 */
export function avaliarNotas(plano: Pick<LimitesPlano, "limiteNotasMes">, emitidasNoMes: number): ResultadoNotas {
  const lim = plano.limiteNotasMes;
  if (lim === null) return { bloqueia: false, nivel: "OK", aviso: null, percentual: null, excedentes: 0 };
  const percentual = Math.floor((emitidasNoMes / lim) * 100);
  const excedentes = Math.max(0, emitidasNoMes - lim);
  if (emitidasNoMes > lim) {
    return { bloqueia: false, nivel: "EXCEDENTE", percentual, excedentes, aviso: `Você passou do limite de ${lim} notas por mês do seu plano: ${excedentes} nota${excedentes === 1 ? "" : "s"} acima. As notas continuam saindo normalmente e o excedente será cobrado conforme o plano.` };
  }
  if (emitidasNoMes === lim) {
    return { bloqueia: false, nivel: "NO_LIMITE", percentual, excedentes, aviso: `Você chegou ao limite de ${lim} notas por mês do seu plano. As próximas continuam saindo, mas serão cobradas como excedente.` };
  }
  if (emitidasNoMes * 100 >= lim * 80) {
    return { bloqueia: false, nivel: "AVISO_80", percentual, excedentes, aviso: `Você usou ${emitidasNoMes} de ${lim} notas deste mês (${percentual}%). Seu plano permite ${lim} notas por mês.` };
  }
  return { bloqueia: false, nivel: "OK", aviso: null, percentual, excedentes };
}

export function checarLimiteSimples(
  quantidadeAtual: number,
  limite: number | null,
  singular: string,
  pluralNome: string,
): ResultadoLimite {
  if (limite === null) return { ok: true, aviso: null, percentual: null };
  if (quantidadeAtual >= limite) {
    return { ok: false, erro: `Seu plano permite ${limite} ${plural(limite, singular, pluralNome)}. Mude de plano em Configurações > Assinatura.` };
  }
  return { ok: true, aviso: null, percentual: Math.round((quantidadeAtual / limite) * 100) };
}
