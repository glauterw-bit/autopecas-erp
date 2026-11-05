// Alerta de churn da oficina / cliente B2B
// ========================================
// Regra (docs/conhecimento/operacao-autopecas-e-crm.md, item 6 — fator 1,5×
// é HIPÓTESE a calibrar com dados da loja):
// - Considera só venda faturada (tipo VENDA, PAGA/FATURADA).
// - Várias compras no mesmo dia contam como UMA visita de compra.
// - Intervalo médio = média dos intervalos entre as últimas N visitas (até 10).
// - Precisa de pelo menos 3 visitas (2 intervalos) para ter ritmo confiável.
// - Em risco quando dias sem comprar > fator × intervalo médio E já passou do
//   mínimo de dias (evita alarme em quem compra todo dia e faltou 2 dias).

export const FATOR_CHURN_PADRAO = 1.5;
export const MIN_VISITAS = 3;
export const JANELA_VISITAS = 10;
export const MIN_DIAS_ALERTA = 7;

const DIA_MS = 86_400_000;

export type SituacaoCliente = "SEM_HISTORICO" | "EM_DIA" | "ATENCAO" | "EM_RISCO";

export interface ResultadoChurn {
  situacao: SituacaoCliente;
  visitas: number;
  intervaloMedioDias: number | null;
  diasSemComprar: number | null;
  ultimaCompra: Date | null;
  /** quantos dias além do esperado (positivo = atrasado) */
  atrasoDias: number | null;
  mensagem: string;
}

/** Normaliza a data para o dia (fuso local da loja: America/Sao_Paulo ≈ UTC-3). */
export function chaveDia(d: Date, offsetHoras = -3): number {
  return Math.floor((d.getTime() + offsetHoras * 3_600_000) / DIA_MS);
}

export function avaliarChurn(
  datasCompras: Date[],
  hoje: Date = new Date(),
  opcoes: { fator?: number; minDias?: number } = {},
): ResultadoChurn {
  const fator = opcoes.fator ?? FATOR_CHURN_PADRAO;
  const minDias = opcoes.minDias ?? MIN_DIAS_ALERTA;
  const dias = [...new Set(datasCompras.map((d) => chaveDia(d)))].sort((a, b) => a - b);
  if (dias.length === 0) {
    return {
      situacao: "SEM_HISTORICO",
      visitas: 0,
      intervaloMedioDias: null,
      diasSemComprar: null,
      ultimaCompra: null,
      atrasoDias: null,
      mensagem: "Ainda não comprou.",
    };
  }
  const ultimoDia = dias[dias.length - 1];
  const ultimaCompra = new Date(
    Math.max(...datasCompras.filter((d) => chaveDia(d) === ultimoDia).map((d) => d.getTime())),
  );
  const diasSemComprar = Math.max(0, chaveDia(hoje) - ultimoDia);

  if (dias.length < MIN_VISITAS) {
    return {
      situacao: "SEM_HISTORICO",
      visitas: dias.length,
      intervaloMedioDias: null,
      diasSemComprar,
      ultimaCompra,
      atrasoDias: null,
      mensagem: `Poucas compras para calcular o ritmo (${dias.length}). Está há ${diasSemComprar} dia(s) sem comprar.`,
    };
  }

  const recentes = dias.slice(-JANELA_VISITAS);
  let soma = 0;
  for (let i = 1; i < recentes.length; i++) soma += recentes[i] - recentes[i - 1];
  const intervaloMedio = soma / (recentes.length - 1);
  const intervaloArred = Math.max(1, Math.round(intervaloMedio));
  const limite = Math.max(minDias, fator * intervaloMedio);
  const atraso = Math.round(diasSemComprar - intervaloMedio);

  let situacao: SituacaoCliente = "EM_DIA";
  if (diasSemComprar > limite) situacao = "EM_RISCO";
  else if (diasSemComprar > intervaloMedio && diasSemComprar >= minDias) situacao = "ATENCAO";

  const base = `Compra a cada ${intervaloArred} dia(s), está há ${diasSemComprar} sem comprar.`;
  return {
    situacao,
    visitas: dias.length,
    intervaloMedioDias: Math.round(intervaloMedio * 10) / 10,
    diasSemComprar,
    ultimaCompra,
    atrasoDias: atraso,
    mensagem: situacao === "EM_DIA" ? base : `${base} ${situacao === "EM_RISCO" ? "Ligue hoje." : "Fique de olho."}`,
  };
}

export interface MetricasCliente {
  compras: number;
  totalCentavos: number;
  ticketMedioCentavos: number;
  frequenciaMediaDias: number | null;
}

/** Ticket = total / nº de vendas faturadas; frequência = intervalo médio entre visitas. */
export function metricasCompras(vendas: Array<{ data: Date; totalCentavos: number }>, hoje = new Date()): MetricasCliente {
  const total = vendas.reduce((a, v) => a + v.totalCentavos, 0);
  const churn = avaliarChurn(vendas.map((v) => v.data), hoje);
  return {
    compras: vendas.length,
    totalCentavos: total,
    ticketMedioCentavos: vendas.length ? Math.round(total / vendas.length) : 0,
    frequenciaMediaDias: churn.intervaloMedioDias,
  };
}

/** Ordena a lista de risco: mais atrasado (proporcionalmente) primeiro. */
export function prioridadeRisco(r: ResultadoChurn): number {
  if (!r.intervaloMedioDias || r.diasSemComprar === null) return 0;
  return r.diasSemComprar / r.intervaloMedioDias;
}
