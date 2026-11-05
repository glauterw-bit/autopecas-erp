import { describe, it, expect } from "vitest";
import { avaliarChurn, metricasCompras, prioridadeRisco } from "./churn";

const d = (s: string) => new Date(`${s}T15:00:00Z`); // 12h em SP

describe("alerta de churn da oficina", () => {
  it("sem compras → sem histórico", () => {
    const r = avaliarChurn([], d("2026-11-04"));
    expect(r.situacao).toBe("SEM_HISTORICO");
    expect(r.diasSemComprar).toBeNull();
  });

  it("menos de 3 visitas → sem ritmo, mas informa dias sem comprar", () => {
    const r = avaliarChurn([d("2026-10-01"), d("2026-10-08")], d("2026-11-04"));
    expect(r.situacao).toBe("SEM_HISTORICO");
    expect(r.diasSemComprar).toBe(27);
  });

  it("oficina semanal há 11 dias sem comprar → em risco (11 > 1,5 × 7)", () => {
    const compras = ["2026-09-23", "2026-09-30", "2026-10-07", "2026-10-14", "2026-10-21", "2026-10-24"].map(d);
    // intervalos: 7,7,7,7,3 → média 6,2; limite max(7, 9,3) = 9,3
    const r = avaliarChurn(compras, d("2026-11-04"));
    expect(r.intervaloMedioDias).toBe(6.2);
    expect(r.diasSemComprar).toBe(11);
    expect(r.situacao).toBe("EM_RISCO");
    expect(r.mensagem).toContain("Compra a cada 6 dia(s), está há 11 sem comprar.");
  });

  it("oficina semanal há 8 dias → atenção (acima da média, abaixo de 1,5×)", () => {
    const compras = ["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27"].map(d);
    const r = avaliarChurn(compras, d("2026-11-04"));
    expect(r.intervaloMedioDias).toBe(7);
    expect(r.diasSemComprar).toBe(8);
    expect(r.situacao).toBe("ATENCAO");
  });

  it("compras no mesmo dia contam como uma visita", () => {
    const compras = [d("2026-10-01"), new Date("2026-10-01T20:00:00Z"), d("2026-10-11"), d("2026-10-21")];
    const r = avaliarChurn(compras, d("2026-10-25"));
    expect(r.visitas).toBe(3);
    expect(r.intervaloMedioDias).toBe(10);
    expect(r.situacao).toBe("EM_DIA");
  });

  it("quem compra todo dia não vira alerta com 3 dias parado (mínimo de 7 dias)", () => {
    const compras = ["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"].map(d);
    const r = avaliarChurn(compras, d("2026-11-04"));
    expect(r.diasSemComprar).toBe(3);
    expect(r.situacao).toBe("EM_DIA");
  });

  it("usa só as últimas 10 visitas para o ritmo", () => {
    // 5 visitas antigas a cada 60 dias, depois 10 visitas a cada 5 dias
    const antigas = [0, 60, 120, 180, 240].map((n) => new Date(d("2025-01-01").getTime() + n * 86_400_000));
    const base = d("2025-10-01").getTime();
    const recentes = Array.from({ length: 10 }, (_, i) => new Date(base + i * 5 * 86_400_000));
    const r = avaliarChurn([...antigas, ...recentes], new Date(base + 45 * 86_400_000 + 3_600_000));
    expect(r.intervaloMedioDias).toBe(5);
    expect(r.situacao).toBe("EM_DIA");
  });

  it("métricas: ticket médio em centavos e frequência", () => {
    const m = metricasCompras(
      [
        { data: d("2026-10-01"), totalCentavos: 15000 },
        { data: d("2026-10-11"), totalCentavos: 25050 },
        { data: d("2026-10-21"), totalCentavos: 10001 },
      ],
      d("2026-10-25"),
    );
    expect(m.totalCentavos).toBe(50051);
    expect(m.ticketMedioCentavos).toBe(16684); // 500,51 / 3 = 166,836… → R$ 166,84
    expect(m.frequenciaMediaDias).toBe(10);
  });

  it("prioridade: proporcionalmente mais atrasado vem primeiro", () => {
    const a = avaliarChurn(["2026-10-01", "2026-10-08", "2026-10-15"].map(d), d("2026-11-04")); // 20/7
    const b = avaliarChurn(["2026-07-01", "2026-08-01", "2026-09-01"].map(d), d("2026-11-04")); // 64/31,5
    expect(prioridadeRisco(a)).toBeGreaterThan(prioridadeRisco(b));
  });
});
